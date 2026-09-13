<?php

use App\Models\User;
use App\Services\Settings\SettingsRepository;
use Laravel\Fortify\Features;

test('two factor qr code and secret key are available after enable', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('two-factor.enable'))
        ->assertRedirect();

    expect($user->refresh()->two_factor_secret)->not->toBeNull();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('two-factor.qr-code'))
        ->assertOk()
        ->assertJsonStructure(['svg', 'url']);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('two-factor.secret-key'))
        ->assertOk()
        ->assertJsonStructure(['secretKey']);
});

test('two factor qr endpoints stay reachable while enrollment is required', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('two-factor.enable'));

    // Enrollment JSON endpoints must not be redirected to security.edit.
    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('two-factor.qr-code'))
        ->assertOk();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->getJson(route('two-factor.secret-key'))
        ->assertOk();
});

test('two factor qr endpoints return 423 without password confirmation', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);

    $user = User::factory()->create();

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => time()])
        ->post(route('two-factor.enable'))
        ->assertRedirect();

    // Expire password confirmation from the enable step so RequirePassword fires.
    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => 0])
        ->getJson(route('two-factor.qr-code'))
        ->assertStatus(423);

    $this->actingAs($user)
        ->withSession(['auth.password_confirmed_at' => 0])
        ->getJson(route('two-factor.secret-key'))
        ->assertStatus(423);
});
