<?php

use App\Enums\PermissionEnum;
use App\Models\Role;
use App\Models\User;
use App\Services\Auth\OidcSocialiteFactory;
use App\Services\Auth\OidcUserResolver;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia;
use Laravel\Socialite\Two\User as SocialiteUser;
use Tests\Support\FakeOidcSocialiteFactory;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function enableOidc(array $overrides = []): void
{
    app(SettingsRepository::class)->setMany(SettingsRepository::SCOPE_PROJECT, 'project', array_merge([
        'oidc_enabled' => true,
        'oidc_issuer' => 'https://idp.example.com/realms/externa',
        'oidc_client_id' => 'externa-app',
        'oidc_client_secret' => Crypt::encryptString('super-secret'),
        'oidc_button_label' => 'Company SSO',
        'oidc_jit_provisioning' => false,
    ], $overrides));
}

function fakeSocialiteUser(
    string $sub = 'sub-abc',
    string $email = 'sso@example.com',
    bool $emailVerified = true,
    ?string $name = 'Sso User',
): SocialiteUser {
    return (new SocialiteUser)->map([
        'id' => $sub,
        'nickname' => null,
        'name' => $name,
        'email' => $email,
        'avatar' => null,
    ])->setRaw([
        'sub' => $sub,
        'email' => $email,
        'email_verified' => $emailVerified,
        'name' => $name,
    ]);
}

function bindOidcFactory(?SocialiteUser $user = null, bool $enabled = true): void
{
    app()->instance(
        OidcSocialiteFactory::class,
        new FakeOidcSocialiteFactory($enabled, $user),
    );
}

test('oidc routes return 404 when disabled', function () {
    // Guests are redirected to login by RenderNotFoundResponse; JSON keeps raw 404.
    $this->getJson(route('auth.oidc.redirect'))->assertNotFound();
    $this->getJson(route('auth.oidc.callback'))->assertNotFound();
});

test('login page exposes oidc CTA when configured', function () {
    enableOidc();

    $this->get(route('login'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('auth/login')
            ->where('canUseOidc', true)
            ->where('oidcButtonLabel', 'Company SSO')
        );
});

test('oidc redirect builds authorize url when enabled', function () {
    enableOidc();

    Http::fake([
        'https://idp.example.com/realms/externa/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://idp.example.com/realms/externa/protocol/openid-connect/auth',
            'token_endpoint' => 'https://idp.example.com/realms/externa/protocol/openid-connect/token',
            'userinfo_endpoint' => 'https://idp.example.com/realms/externa/protocol/openid-connect/userinfo',
        ]),
    ]);

    $response = $this->get(route('auth.oidc.redirect'));

    $response->assertRedirect();
    expect($response->headers->get('Location'))
        ->toContain('https://idp.example.com/realms/externa/protocol/openid-connect/auth')
        ->toContain('client_id=externa-app')
        ->toContain('response_type=code')
        ->toContain('scope=');
});

test('callback links existing user by verified email and stores sub', function () {
    enableOidc();

    $user = User::factory()->create([
        'email' => 'sso@example.com',
        'is_active' => true,
    ]);

    bindOidcFactory(fakeSocialiteUser());

    $this->get(route('auth.oidc.callback'))
        ->assertRedirect();

    $this->assertAuthenticatedAs($user->fresh());
    expect($user->fresh()->oidc_sub)->toBe('sub-abc');
});

test('callback rejects unknown email when jit off', function () {
    enableOidc(['oidc_jit_provisioning' => false]);
    bindOidcFactory(fakeSocialiteUser());

    $this->from(route('login'))
        ->get(route('auth.oidc.callback'))
        ->assertRedirect(route('login'))
        ->assertSessionHasErrors('email');

    $this->assertGuest();
});

test('callback rejects unverified email', function () {
    enableOidc();
    User::factory()->create(['email' => 'sso@example.com']);
    bindOidcFactory(fakeSocialiteUser(emailVerified: false));

    $this->from(route('login'))
        ->get(route('auth.oidc.callback'))
        ->assertSessionHasErrors('email');

    $this->assertGuest();
});

test('callback rejects inactive user', function () {
    enableOidc();
    User::factory()->create([
        'email' => 'sso@example.com',
        'is_active' => false,
    ]);
    bindOidcFactory(fakeSocialiteUser());

    $this->from(route('login'))
        ->get(route('auth.oidc.callback'))
        ->assertSessionHasErrors('email');

    $this->assertGuest();
});

test('jit on creates user with default role and allowed domain', function () {
    enableOidc([
        'oidc_jit_provisioning' => true,
        'allowed_domains' => ['example.com'],
        'default_user_role' => 'member',
    ]);

    Role::query()->firstOrCreate([
        'name' => 'member',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ], [
        'is_assignable' => true,
    ]);
    Role::query()->where('name', 'member')->update(['is_assignable' => true]);

    bindOidcFactory(fakeSocialiteUser());

    $this->get(route('auth.oidc.callback'))->assertRedirect();

    $user = User::query()->where('email', 'sso@example.com')->first();
    expect($user)->not->toBeNull()
        ->and($user->oidc_sub)->toBe('sub-abc')
        ->and($user->password)->toBeNull()
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->hasRole('member'))->toBeTrue();

    $this->assertAuthenticatedAs($user);
});

test('jit on rejects disallowed domain', function () {
    enableOidc([
        'oidc_jit_provisioning' => true,
        'allowed_domains' => ['qiick.io'],
    ]);
    bindOidcFactory(fakeSocialiteUser());

    $this->from(route('login'))
        ->get(route('auth.oidc.callback'))
        ->assertSessionHasErrors('email');

    expect(User::query()->where('email', 'sso@example.com')->exists())->toBeFalse();
    $this->assertGuest();
});

test('project settings encrypt oidc secret and never return plaintext', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'oidc_enabled' => true,
            'oidc_issuer' => 'https://idp.example.com/realms/externa',
            'oidc_client_id' => 'externa-app',
            'oidc_client_secret' => 'plain-secret-value',
            'oidc_button_label' => 'SSO',
            'oidc_jit_provisioning' => false,
        ]))
        ->assertSessionHasNoErrors();

    $project = app(ProjectSettings::class);
    expect($project->oidcClientSecret())->toBe('plain-secret-value')
        ->and($project->oidcLoginAvailable())->toBeTrue();

    $edit = $project->forEdit();
    expect($edit)->not->toHaveKey('oidc_client_secret')
        ->and($edit['oidc_client_secret_configured'])->toBeTrue()
        ->and($edit['oidc_enabled'])->toBeTrue();

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('project.oidc_client_secret_configured', true)
            ->missing('project.oidc_client_secret')
        );
});

test('resolver prefers existing oidc_sub over email', function () {
    enableOidc();

    $linked = User::factory()->create([
        'email' => 'old@example.com',
        'oidc_sub' => 'sub-abc',
        'is_active' => true,
    ]);
    User::factory()->create([
        'email' => 'sso@example.com',
        'is_active' => true,
    ]);

    $resolved = app(OidcUserResolver::class)->resolve(fakeSocialiteUser());

    expect($resolved->is($linked))->toBeTrue();
});

test('resolver throws when email already linked to different sub', function () {
    enableOidc();

    User::factory()->create([
        'email' => 'sso@example.com',
        'oidc_sub' => 'other-sub',
        'is_active' => true,
    ]);

    expect(fn () => app(OidcUserResolver::class)->resolve(fakeSocialiteUser()))
        ->toThrow(ValidationException::class);
});
