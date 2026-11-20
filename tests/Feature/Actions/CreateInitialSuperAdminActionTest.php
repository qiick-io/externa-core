<?php

declare(strict_types=1);

use App\Actions\CreateInitialSuperAdminAction;
use App\Data\InitialSuperAdminData;
use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
});

it('creates a verified active super admin from the install credentials', function () {
    $user = app(CreateInitialSuperAdminAction::class)->execute(new InitialSuperAdminData(
        firstName: 'Super',
        lastName: 'Admin',
        email: 'ops@example.com',
        password: 'Install-Secret-1',
    ));

    expect($user)->not->toBeNull()
        ->and($user->email)->toBe('ops@example.com')
        ->and($user->is_active)->toBeTrue()
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->hasRole(RoleEnum::SuperAdmin->value))->toBeTrue()
        ->and(Hash::check('Install-Secret-1', $user->password))->toBeTrue();
});

it('leaves an existing admin untouched', function () {
    $existing = User::factory()->create([
        'email' => 'ops@example.com',
        'first_name' => 'Existing',
        'password' => 'original-secret-password',
        'is_active' => false,
        'email_verified_at' => null,
    ]);
    $existing->assignRole(RoleEnum::Admin->value);

    $result = app(CreateInitialSuperAdminAction::class)->execute(new InitialSuperAdminData(
        firstName: 'Super',
        lastName: 'Admin',
        email: 'ops@example.com',
        password: 'Install-Secret-1',
    ));

    $existing->refresh();

    expect($result)->toBeNull()
        ->and($existing->first_name)->toBe('Existing')
        ->and($existing->is_active)->toBeFalse()
        ->and($existing->email_verified_at)->toBeNull()
        ->and(Hash::check('original-secret-password', $existing->password))->toBeTrue()
        ->and($existing->hasRole(RoleEnum::SuperAdmin->value))->toBeFalse();
});
