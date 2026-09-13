<?php

use App\Enums\PermissionEnum;
use App\Http\Responses\PasskeyLoginResponse;
use App\Models\User;
use App\Services\Settings\SettingsRepository;
use App\Support\Auth\HomePath;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;
use Laravel\Passkeys\Contracts\PasskeyLoginResponse as PasskeyLoginResponseContract;
use Laravel\Passkeys\Passkey;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('passkeys fortify feature is enabled', function () {
    expect(Features::canManagePasskeys())->toBeTrue();
});

test('login screen exposes canManagePasskeys when enabled', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $this->get(route('login'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('auth/login')
            ->where('canManagePasskeys', true)
        );
});

test('security page lists passkeys for the authenticated user', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::passkeys(['confirmPassword' => true]);

    $user = User::factory()->create();
    $passkey = $user->passkeys()->create([
        'name' => 'Laptop',
        'credential_id' => 'cred-'.uniqid(),
        'credential' => ['publicKeyCredentialId' => 'cred', 'aaguid' => '00000000-0000-0000-0000-000000000000'],
    ]);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('security.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/security')
            ->where('canManagePasskeys', true)
            ->has('passkeys', 1)
            ->where('passkeys.0.id', $passkey->id)
            ->where('passkeys.0.name', 'Laptop')
        );
});

test('authenticated user can delete their own passkey', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::passkeys(['confirmPassword' => true]);

    $user = User::factory()->create();
    $passkey = $user->passkeys()->create([
        'name' => 'Phone',
        'credential_id' => 'cred-del-'.uniqid(),
        'credential' => ['publicKeyCredentialId' => 'cred-del', 'aaguid' => '00000000-0000-0000-0000-000000000000'],
    ]);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('passkey.destroy', $passkey))
        ->assertRedirect();

    expect(Passkey::query()->whereKey($passkey->id)->exists())->toBeFalse();
});

test('user cannot delete another users passkey', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::passkeys(['confirmPassword' => true]);

    $owner = User::factory()->create();
    $other = User::factory()->create();
    $passkey = $owner->passkeys()->create([
        'name' => 'Owner key',
        'credential_id' => 'cred-other-'.uniqid(),
        'credential' => ['publicKeyCredentialId' => 'cred-other', 'aaguid' => '00000000-0000-0000-0000-000000000000'],
    ]);

    $this->actingAs($other)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->delete(route('passkey.destroy', $passkey))
        ->assertForbidden();

    expect(Passkey::query()->whereKey($passkey->id)->exists())->toBeTrue();
});

test('passkey registration options require authentication', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $this->getJson(route('passkey.registration-options'))
        ->assertUnauthorized();
});

test('authenticated user can fetch passkey registration options', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::passkeys(['confirmPassword' => true]);

    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('passkey.registration-options'))
        ->assertOk()
        ->assertJsonStructure(['options']);
});

test('passkey login response redirects via HomePath', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $user = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'pk-home-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowFiles->value]);
    $user->syncRoles([$role]);

    expect(app(PasskeyLoginResponseContract::class))->toBeInstanceOf(PasskeyLoginResponse::class);

    $request = Request::create('/passkeys/login', 'POST');
    $request->setUserResolver(fn () => $user);
    $request->headers->set('Accept', 'application/json');

    $response = app(PasskeyLoginResponseContract::class)->toResponse($request);

    expect($response->getStatusCode())->toBe(200)
        ->and(json_decode($response->getContent(), true)['redirect'])
        ->toBe(url(HomePath::for($user)));
});

test('users with only a passkey satisfy two factor required', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());
    $this->skipUnlessFortifyFeature(Features::passkeys());

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();
    $user->passkeys()->create([
        'name' => 'MFA key',
        'credential_id' => 'cred-mfa-'.uniqid(),
        'credential' => ['publicKeyCredentialId' => 'cred-mfa', 'aaguid' => '00000000-0000-0000-0000-000000000000'],
    ]);

    $this->actingAs($user)
        ->get(route('notifications.index'))
        ->assertOk();
});

test('security page hides enforced banner when user has a passkey', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);
    Features::passkeys(['confirmPassword' => true]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();
    $user->passkeys()->create([
        'name' => 'Banner key',
        'credential_id' => 'cred-banner-'.uniqid(),
        'credential' => ['publicKeyCredentialId' => 'cred-banner', 'aaguid' => '00000000-0000-0000-0000-000000000000'],
    ]);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->get(route('security.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('twoFactorRequired', true)
            ->where('twoFactorEnabled', false)
            ->where('twoFactorEnforcedForUser', false)
            ->has('passkeys', 1)
        );
});

test('passkey management routes stay reachable when two factor is required', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::passkeys(['confirmPassword' => true]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('passkey.registration-options'))
        ->assertOk();
});
