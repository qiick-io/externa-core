<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Middleware\ThrottleAuthSensitiveMiddleware;
use App\Models\Role;
use App\Models\User;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Qiick\Oidc\Models\UserIdentity;
use Qiick\Oidc\Testing\FakeIdentityProvider;
use Tests\TestCase;

/*
 * SSO through qiick/laravel-oidc (#827): Externa's settings, linking, dual-read of oidc_sub,
 * second factor, and SSO-only / break-glass. The IdP is the package's in-memory fake: no network.
 */

const FAKE_ISSUER = 'https://idp.example.com/realms/externa';

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
    // Do not disable ThrottleRequests: ThrottleAuthSensitiveMiddleware typehints it.
    $this->withoutMiddleware(ThrottleAuthSensitiveMiddleware::class);
});

/**
 * @param  array<string, mixed>  $overrides
 */
function enableOidc(array $overrides = []): void
{
    app(SettingsRepositoryService::class)->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', array_merge([
        'oidc_enabled' => true,
        'oidc_issuer' => FAKE_ISSUER,
        'oidc_client_id' => 'externa-app',
        'oidc_client_secret' => Crypt::encryptString('fake-client-secret'),
        'oidc_button_label' => 'Company SSO',
        'oidc_jit_provisioning' => false,
        'oidc_auto_link' => false,
        'oidc_only' => false,
    ], $overrides));
}

/**
 * @param  array<string, mixed>  $claims
 */
function signInThroughSso(TestCase $testCase, FakeIdentityProvider $identityProvider, array $claims = []): TestResponse
{
    $authorizationUrl = (string) $testCase->get(route('oidc.redirect'))->assertRedirect()->headers->get('Location');

    return $testCase->get($identityProvider->authorize($authorizationUrl, $claims));
}

function linkIdentity(User $user, string $subject, string $issuer = FAKE_ISSUER): UserIdentity
{
    return UserIdentity::query()->create(['user_id' => $user->id, 'issuer' => $issuer, 'subject' => $subject]);
}

it('answers 404 on the redirect, callback and back-channel logout routes while SSO is off', function (Closure $arrange) {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    $arrange();

    expect(Config::boolean('oidc.routes.enabled'))->toBeFalse();

    $this->getJson('/auth/oidc/redirect')->assertNotFound();
    $this->getJson('/auth/oidc/callback?state=any&code=any')->assertNotFound();
    $this->postJson('/auth/oidc/backchannel-logout', [
        'logout_token' => $identityProvider->sign($identityProvider->logoutTokenClaims(), ['typ' => 'logout+jwt']),
    ])->assertNotFound();
    $this->get(route('login'))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('canUseOidc', false)
        ->where('oidcRedirectUrl', null));
})->with([
    'never configured' => [fn () => null],
    'configured but switched off' => [fn () => enableOidc(['oidc_enabled' => false])],
    'switched on without a client id' => [fn () => enableOidc(['oidc_client_id' => null])],
]);

it('shows the SSO button only when SSO is enabled and fully configured', function () {
    enableOidc();

    $this->get(route('login'))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('canUseOidc', true)
        ->where('oidcButtonLabel', 'Company SSO')
        ->where('oidcRedirectUrl', route('oidc.redirect'))
        ->where('isPasswordLoginVisible', true));
});

it('sends the browser to the IdP with PKCE S256 and the settings client id', function () {
    Http::preventStrayRequests();
    FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc();

    $location = (string) $this->get(route('oidc.redirect'))->assertRedirect()->headers->get('Location');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    expect($location)->toStartWith(FAKE_ISSUER.'/protocol/openid-connect/auth?')
        ->and($query['client_id'] ?? null)->toBe('externa-app')
        ->and($query['redirect_uri'] ?? null)->toBe(url('/auth/oidc/callback'))
        ->and($query['scope'] ?? null)->toBe('openid profile email')
        ->and($query['code_challenge_method'] ?? null)->toBe('S256');
});

it('signs in the user linked to the identity, whatever the email', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc();
    $user = User::factory()->create(['email' => 'other@example.com']);
    linkIdentity($user, 'sub-abc');

    signInThroughSso($this, $identityProvider, ['sub' => 'sub-abc'])->assertRedirect();

    $this->assertAuthenticatedAs($user);
    expect(UserIdentity::query()->sole()->last_login_at)->not->toBeNull();
});

it('signs in a user who only has a legacy oidc_sub and creates an identity row', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc(['oidc_auto_link' => false]);
    $user = User::factory()->create([
        'email' => 'legacy@example.com',
        'oidc_sub' => 'sub-legacy-only',
    ]);

    expect(UserIdentity::query()->count())->toBe(0);

    signInThroughSso($this, $identityProvider, [
        'sub' => 'sub-legacy-only',
        'email' => 'nobody@example.com',
    ])->assertRedirect();

    $this->assertAuthenticatedAs($user);
    expect(UserIdentity::query()->sole()->only(['user_id', 'issuer', 'subject']))
        ->toBe(['user_id' => $user->id, 'issuer' => FAKE_ISSUER, 'subject' => 'sub-legacy-only'])
        ->and($user->fresh()->oidc_sub)->toBe('sub-legacy-only');
});

it('prefers an identity row over a legacy oidc_sub on another user', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc();
    $identityOwner = User::factory()->create(['email' => 'owner@example.com']);
    $legacyOwner = User::factory()->create([
        'email' => 'legacy@example.com',
        'oidc_sub' => 'sub-shared',
    ]);
    linkIdentity($identityOwner, 'sub-shared');

    signInThroughSso($this, $identityProvider, [
        'sub' => 'sub-shared',
        'email' => 'nobody@example.com',
    ])->assertRedirect();

    $this->assertAuthenticatedAs($identityOwner);
    expect(UserIdentity::query()->where('subject', 'sub-shared')->count())->toBe(1)
        ->and($legacyOwner->fresh()->oidc_sub)->toBe('sub-shared');
});

it('links a second identity from another issuer to the same user', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc(['oidc_auto_link' => true]);
    $user = User::factory()->create(['email' => 'multi@example.com']);
    linkIdentity($user, 'sub-first', 'https://other-idp.example.com');

    signInThroughSso($this, $identityProvider, [
        'sub' => 'sub-second',
        'email' => 'multi@example.com',
        'email_verified' => true,
    ])->assertRedirect();

    $this->assertAuthenticatedAs($user);
    expect(UserIdentity::query()->where('user_id', $user->id)->count())->toBe(2)
        ->and(UserIdentity::query()->where('issuer', FAKE_ISSUER)->where('subject', 'sub-second')->exists())->toBeTrue();
});

it('links an existing user by verified email only with auto-link on', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    $user = User::factory()->create(['email' => 'sso.user@example.com']);

    enableOidc(['oidc_auto_link' => false]);
    signInThroughSso($this, $identityProvider, [
        'sub' => 'sub-new',
        'email' => 'sso.user@example.com',
        'email_verified' => true,
    ])->assertRedirect(route('login'));
    $this->assertGuest();

    enableOidc(['oidc_auto_link' => true]);
    signInThroughSso($this, $identityProvider, [
        'sub' => 'sub-new',
        'email' => 'sso.user@example.com',
        'email_verified' => true,
    ])->assertRedirect();

    $this->assertAuthenticatedAs($user);
    expect(UserIdentity::query()->sole()->subject)->toBe('sub-new');
});

it('jit on creates user with default role and allowed domain', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
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

    signInThroughSso($this, $identityProvider, [
        'sub' => 'sub-jit',
        'email' => 'sso@example.com',
        'email_verified' => true,
        'given_name' => 'Sso',
        'family_name' => 'User',
    ])->assertRedirect();

    $user = User::query()->where('email', 'sso@example.com')->first();
    expect($user)->not->toBeNull()
        ->and($user->password)->toBeNull()
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->hasRole('member'))->toBeTrue()
        ->and(UserIdentity::query()->where('user_id', $user->id)->where('subject', 'sub-jit')->exists())->toBeTrue();

    $this->assertAuthenticatedAs($user);
});

it('rejects inactive users', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc();
    $user = User::factory()->create(['is_active' => false]);
    linkIdentity($user, 'sub-inactive');

    signInThroughSso($this, $identityProvider, ['sub' => 'sub-inactive'])
        ->assertRedirect(route('login'))
        ->assertSessionHasErrors('email');

    $this->assertGuest();
});

it('treats subjects as case-sensitive', function () {
    $identityProvider = FakeIdentityProvider::fake(issuer: FAKE_ISSUER, clientId: 'externa-app');
    enableOidc();
    $upper = User::factory()->create(['email' => 'upper@example.com']);
    $lower = User::factory()->create(['email' => 'lower@example.com']);
    linkIdentity($upper, 'Sub-Case');
    linkIdentity($lower, 'sub-case');

    signInThroughSso($this, $identityProvider, ['sub' => 'Sub-Case', 'email' => 'nobody@example.com'])
        ->assertRedirect();
    $this->assertAuthenticatedAs($upper);
    $this->post(route('logout'));

    signInThroughSso($this, $identityProvider, ['sub' => 'sub-case', 'email' => 'nobody@example.com'])
        ->assertRedirect();
    $this->assertAuthenticatedAs($lower);
});

it('keeps a break-glass local admin while SSO-only hides the password form', function () {
    enableOidc(['oidc_only' => true]);
    $breakGlass = User::factory()->withTwoFactor()->create([
        'email' => 'breakglass@example.com',
        'password' => bcrypt('password'),
    ]);
    $breakGlass->assignRole(RoleEnum::SuperAdmin->value);

    $regular = User::factory()->create([
        'email' => 'regular@example.com',
        'password' => bcrypt('password'),
    ]);

    $this->get(route('login'))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('canUseOidc', true)
        ->where('isPasswordLoginVisible', false));

    $this->get(route('login', ['local' => 1]))->assertInertia(fn (AssertableInertia $page) => $page
        ->where('isPasswordLoginVisible', true));

    $this->post(route('login.store'), [
        'email' => 'regular@example.com',
        'password' => 'password',
    ])->assertSessionHasErrors();
    $this->assertGuest();

    $this->post(route('login.store'), [
        'email' => 'breakglass@example.com',
        'password' => 'password',
    ]);
    // Confirmed 2FA: Fortify may challenge; either authenticated or redirected to 2FA is fine
    // as long as the credentials were accepted for the break-glass account.
    expect(session('login.id') === $breakGlass->id || auth()->id() === $breakGlass->id)->toBeTrue();
});

it('project settings encrypt oidc secret and never return plaintext', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.security.update'), baseSecurityPayload([
            'oidc_enabled' => true,
            'oidc_issuer' => 'https://idp.example.com/realms/externa',
            'oidc_client_id' => 'externa-app',
            'oidc_client_secret' => 'plain-secret-value',
            'oidc_button_label' => 'SSO',
            'oidc_jit_provisioning' => false,
            'oidc_auto_link' => false,
            'oidc_only' => false,
        ]))
        ->assertSessionHasNoErrors();

    $project = app(ProjectSettingsService::class);
    expect($project->security()->oidcClientSecret())->toBe('plain-secret-value')
        ->and($project->security()->isOidcLoginAvailable())->toBeTrue();

    $this->actingAs($user)
        ->get(route('project.security.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('project.oidc_client_secret_configured', true)
            ->missing('project.oidc_client_secret')
            ->where('oidcCallbackUrl', url('/auth/oidc/callback'))
            ->where('oidcBackchannelLogoutUrl', url('/auth/oidc/backchannel-logout'))
        );
});
