<?php

use App\Models\User;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Laravel\Fortify\Features;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('shows the passkey sign-in CTA on the login page', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $page = visit('/login');

    $page->assertSee('Sign in with passkey')
        ->assertSee('or continue with email')
        ->assertPresent('[data-test="passkey-login-button"]')
        // Click-only: must not spin on load (may be disabled on HTTP /.test — no secure context).
        ->assertMissing('[data-test="passkey-login-button"] svg.animate-spin')
        ->assertEnabled('email')
        ->assertEnabled('password')
        ->assertNoJavaScriptErrors();
});

it('shows the passkey confirm CTA on the confirm-password page', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $user = User::factory()->create([
        'email' => 'passkey-confirm@example.com',
        'password' => 'password',
    ]);

    $user->passkeys()->create([
        'name' => 'Confirm Browser Key',
        'credential_id' => 'cred-confirm-browser-'.uniqid(),
        'credential' => [
            'publicKeyCredentialId' => 'cred-confirm-browser',
            'aaguid' => '00000000-0000-0000-0000-000000000000',
        ],
    ]);

    $this->actingAs($user);

    $page = visit('/user/confirm-password');

    $page->assertSee('Confirm password')
        ->assertSee('Confirm with passkey')
        ->assertPresent('[data-test="confirm-password-button"]')
        ->assertPresent('[data-test="passkey-confirm-button"]')
        // Click-only: CTA must not be spinning/disabled on load.
        ->assertAttributeMissing('[data-test="passkey-confirm-button"]', 'disabled')
        ->assertMissing('[data-test="passkey-confirm-button"] svg.animate-spin')
        ->assertEnabled('password')
        ->assertNoJavaScriptErrors();
});

it('shows the passkeys section on security settings', function () {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    Features::passkeys(['confirmPassword' => true]);

    $user = User::factory()->create([
        'email' => 'passkey-security@example.com',
        'password' => 'password',
    ]);

    $user->passkeys()->create([
        'name' => 'Browser Test Key',
        'credential_id' => 'cred-browser-'.uniqid(),
        'credential' => [
            'publicKeyCredentialId' => 'cred-browser',
            'aaguid' => '00000000-0000-0000-0000-000000000000',
        ],
    ]);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()]);

    $page = visit('/settings/security');

    $page->assertSee('Passkeys')
        ->assertSee('Browser Test Key')
        ->assertPresent('[data-test="passkeys-section"]')
        ->assertPresent('[data-test="add-passkey-button"]')
        ->assertPresent('[data-test="delete-passkey-button"]')
        ->assertNoJavaScriptErrors();
});

it('shows the two factor required banner mentioning passkeys', function () {
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

    $user = User::factory()->create([
        'email' => 'passkey-enforced@example.com',
        'password' => 'password',
    ]);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()]);

    $page = visit('/settings/security');

    $page->assertPresent('[data-test="two-factor-required-banner"]')
        ->assertSee('Enable 2FA or register a passkey')
        ->assertNoJavaScriptErrors();
});
