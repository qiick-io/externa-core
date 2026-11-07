<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Artisan;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

test('permission sync creates database rows for every enum case', function () {
    Artisan::call('permissions:sync');

    expect(Permission::query()->count())->toBe(count(PermissionEnum::cases()));

    foreach (PermissionEnum::values() as $permissionName) {
        expect(Permission::query()->where('name', $permissionName)->exists())->toBeTrue();
    }
});

test('permission sync with prune removes stale permissions', function () {
    Artisan::call('permissions:sync');

    Permission::query()->create([
        'name' => 'can-obsolete-module',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    Artisan::call('permissions:sync', ['--prune' => true]);

    expect(Permission::query()->where('name', 'can-obsolete-module')->exists())->toBeFalse();
});

test('fresh install grants deploy.trigger and ai.prompts.manage to the admin role', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = Role::findByName(RoleEnum::Admin->value);

    expect($admin->hasPermissionTo(PermissionEnum::DeployTrigger->value))->toBeTrue()
        ->and($admin->hasPermissionTo(PermissionEnum::CanManageAiPrompts->value))->toBeTrue();
});

test('externa:upgrade grants permissions new since 1.3.0 to admin without restoring revoked ones', function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    // 1.3.0 shape: the new permissions do not exist yet, and the operator removed one from admin.
    Permission::query()
        ->whereIn('name', [PermissionEnum::DeployTrigger->value, PermissionEnum::CanManageAiPrompts->value])
        ->delete();
    Role::findByName(RoleEnum::Admin->value)->revokePermissionTo(PermissionEnum::CanManageApiKeys->value);
    app(PermissionRegistrar::class)->forgetCachedPermissions();

    $this->artisan('externa:upgrade', ['--force' => true, '--no-migrate' => true])->assertSuccessful();

    $admin = Role::findByName(RoleEnum::Admin->value);

    expect($admin->hasPermissionTo(PermissionEnum::DeployTrigger->value))->toBeTrue()
        ->and($admin->hasPermissionTo(PermissionEnum::CanManageAiPrompts->value))->toBeTrue()
        ->and($admin->hasPermissionTo(PermissionEnum::CanManageApiKeys->value))->toBeFalse()
        ->and(Role::findByName(RoleEnum::Reader->value)->hasPermissionTo(PermissionEnum::DeployTrigger->value))->toBeFalse();
});
