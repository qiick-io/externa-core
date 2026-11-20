<?php

declare(strict_types=1);

use Database\Seeders\CreateSuperAdminSeeder;
use Illuminate\Validation\Rules\Password;

beforeEach(function () {
    // Unit suite has no migrations; pin the default rule without reading project settings.
    Password::defaults(fn (): Password => Password::min(8)->mixedCase()->numbers());
});

it('requires a prompted or configured strong password outside local and testing', function (string $environment) {
    expect(CreateSuperAdminSeeder::installNeedsCredentials($environment, null))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, ''))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, 'password'))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, 'Ab1'))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, 'Password1'))->toBeFalse();
})->with(['production', 'staging']);

it('does not require credentials in local or testing even when the password is empty', function (string $environment) {
    expect(CreateSuperAdminSeeder::installNeedsCredentials($environment, null))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, ''))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, 'password'))->toBeFalse();
})->with(['local', 'testing']);

it('fails closed under --no-interaction when credentials are required', function () {
    expect(CreateSuperAdminSeeder::installMustFailClosed(
        isInteractive: false,
        environment: 'production',
        password: null,
    ))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installMustFailClosed(
            isInteractive: false,
            environment: 'production',
            password: 'password',
        ))->toBeTrue();
});

it('does not fail closed when interactive or when a strong password is already set', function () {
    expect(CreateSuperAdminSeeder::installMustFailClosed(
        isInteractive: true,
        environment: 'production',
        password: null,
    ))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installMustFailClosed(
            isInteractive: false,
            environment: 'production',
            password: 'Password1',
        ))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installMustFailClosed(
            isInteractive: false,
            environment: 'local',
            password: null,
        ))->toBeFalse();
});
