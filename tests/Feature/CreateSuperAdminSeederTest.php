<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\CreateSuperAdminSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Hash;

test('create super admin seeder creates a verified active user', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class, CreateSuperAdminSeeder::class]);

    $user = User::query()->where('email', config('super_admin.email'))->first();

    expect($user)->not->toBeNull()
        ->and($user->first_name)->toBe(config('super_admin.first_name'))
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->is_active)->toBeTrue();

    expect(Hash::check(config('super_admin.password'), $user->password))->toBeTrue()
        ->and($user->hasRole(RoleEnum::SuperAdmin->value))->toBeTrue();
});

test('create super admin seeder is idempotent by email', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class, CreateSuperAdminSeeder::class]);
    $this->seed([PermissionSeeder::class, RoleSeeder::class, CreateSuperAdminSeeder::class]);

    expect(User::query()->where('email', config('super_admin.email'))->count())->toBe(1);
});
