<?php

use App\Models\User;
use Laravel\Fortify\Features;
use PragmaRX\Google2FA\Google2FA;

test('confirm accepts valid totp from encrypted secret', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
        'window' => 1,
    ]);

    $user = User::factory()->create();
    $session = ['auth.password_confirmed_at' => time()];

    $this->actingAs($user)
        ->withSession($session)
        ->post(route('two-factor.enable'))
        ->assertRedirect();

    $user->refresh();
    expect($user->two_factor_secret)->not->toBeNull();
    expect($user->two_factor_confirmed_at)->toBeNull();

    $secret = \Laravel\Fortify\Fortify::currentEncrypter()->decrypt($user->two_factor_secret);
    $code = (new Google2FA)->getCurrentOtp($secret);

    $this->actingAs($user)
        ->withSession($session)
        ->post(route('two-factor.confirm'), ['code' => $code])
        ->assertRedirect();

    expect($user->refresh()->two_factor_confirmed_at)->not->toBeNull();
});

test('confirm rejects invalid code into named error bag and keeps secret', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);

    $user = User::factory()->create();
    $session = ['auth.password_confirmed_at' => time()];

    $this->actingAs($user)
        ->withSession($session)
        ->post(route('two-factor.enable'));

    $secretBefore = $user->refresh()->two_factor_secret;

    $this->actingAs($user)
        ->withSession($session)
        ->from(route('security.edit'))
        ->post(route('two-factor.confirm'), ['code' => '000000'])
        ->assertSessionHasErrorsIn('confirmTwoFactorAuthentication', ['code']);

    expect($user->refresh()->two_factor_secret)->toBe($secretBefore)
        ->and($user->two_factor_confirmed_at)->toBeNull();
});

test('security edit revisits keep unconfirmed secret so scanned qr stays valid', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());

    Features::twoFactorAuthentication([
        'confirm' => true,
        'confirmPassword' => true,
    ]);

    $user = User::factory()->create();
    $session = ['auth.password_confirmed_at' => time()];

    $this->actingAs($user)
        ->withSession($session)
        ->post(route('two-factor.enable'));

    $secret = $user->refresh()->two_factor_secret;
    expect($secret)->not->toBeNull();

    $this->actingAs($user)
        ->withSession($session)
        ->get(route('security.edit'))
        ->assertOk();

    sleep(2);

    // Previously Fortify ensureStateIsValid wiped this on the second visit.
    $this->actingAs($user)
        ->withSession($session)
        ->get(route('security.edit'))
        ->assertOk();

    expect($user->refresh()->two_factor_secret)->toBe($secret);

    $plain = \Laravel\Fortify\Fortify::currentEncrypter()->decrypt($secret);
    $code = (new Google2FA)->getCurrentOtp($plain);

    $this->actingAs($user)
        ->withSession($session)
        ->post(route('two-factor.confirm'), ['code' => $code])
        ->assertRedirect();

    expect($user->refresh()->two_factor_confirmed_at)->not->toBeNull();
});
