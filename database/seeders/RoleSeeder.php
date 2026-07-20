<?php

namespace Database\Seeders;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * Seed default application roles and attach permissions from {@see PermissionSeeder}.
 *
 * Super-admin and admin receive every permission; reader receives only `can-show-*` permissions.
 * Public is a locked system role for anonymous CMS API access (no Spatie admin permissions).
 */
class RoleSeeder extends Seeder
{
    /**
     * Create roles and sync their permission sets.
     */
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $guard = config('auth.defaults.guard', 'web');

        $superAdmin = Role::query()->firstOrCreate(
            ['name' => RoleEnum::SuperAdmin->value, 'guard_name' => $guard],
            ['is_system' => false, 'is_assignable' => true],
        );

        $admin = Role::query()->firstOrCreate(
            ['name' => RoleEnum::Admin->value, 'guard_name' => $guard],
            ['is_system' => false, 'is_assignable' => true],
        );

        $reader = Role::query()->firstOrCreate(
            ['name' => RoleEnum::Reader->value, 'guard_name' => $guard],
            ['is_system' => false, 'is_assignable' => true],
        );

        $public = Role::query()->firstOrCreate(
            ['name' => RoleEnum::Public->value, 'guard_name' => $guard],
            ['is_system' => true, 'is_assignable' => false],
        );

        $public->forceFill([
            'is_system' => true,
            'is_assignable' => false,
        ])->save();

        $allPermissions = Permission::query()->where('guard_name', $guard)->pluck('name');

        $superAdmin->syncPermissions($allPermissions);
        $admin->syncPermissions($allPermissions);

        $readerPermissions = collect(PermissionEnum::cases())
            ->filter(fn (PermissionEnum $permission): bool => str_starts_with($permission->value, 'can-show-'))
            ->map(fn (PermissionEnum $permission): string => $permission->value)
            ->all();

        $reader->syncPermissions($readerPermissions);
        $public->syncPermissions([]);
    }
}
