<?php

declare(strict_types=1);

use Database\Seeders\CreateSuperAdminSeeder;

it('requires a prompted or configured password outside local and testing', function (string $environment) {
    expect(CreateSuperAdminSeeder::installNeedsCredentials($environment, null))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, ''))->toBeTrue()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, 'secret'))->toBeFalse();
})->with(['production', 'staging']);

it('does not require credentials in local or testing even when the password is empty', function (string $environment) {
    expect(CreateSuperAdminSeeder::installNeedsCredentials($environment, null))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installNeedsCredentials($environment, ''))->toBeFalse();
})->with(['local', 'testing']);

it('fails closed under --no-interaction when credentials are required', function () {
    expect(CreateSuperAdminSeeder::installMustFailClosed(
        isInteractive: false,
        environment: 'production',
        password: null,
    ))->toBeTrue();
});

it('does not fail closed when interactive or when a password is already set', function () {
    expect(CreateSuperAdminSeeder::installMustFailClosed(
        isInteractive: true,
        environment: 'production',
        password: null,
    ))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installMustFailClosed(
            isInteractive: false,
            environment: 'production',
            password: 'strong-enough-password',
        ))->toBeFalse()
        ->and(CreateSuperAdminSeeder::installMustFailClosed(
            isInteractive: false,
            environment: 'local',
            password: null,
        ))->toBeFalse();
});
