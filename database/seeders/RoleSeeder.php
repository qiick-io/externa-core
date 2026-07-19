<?php

namespace Database\Seeders;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Seed default application roles and attach permissions from {@see PermissionSeeder}.
 *
 * Super-admin and admin receive every permission; reader receives only `can-show-*` permissions.
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
        );

        $admin = Role::query()->firstOrCreate(
            ['name' => RoleEnum::Admin->value, 'guard_name' => $guard],
        );

        $reader = Role::query()->firstOrCreate(
            ['name' => RoleEnum::Reader->value, 'guard_name' => $guard],
        );

        $allPermissions = Permission::query()->where('guard_name', $guard)->pluck('name');

        $superAdmin->syncPermissions($allPermissions);
        $admin->syncPermissions($allPermissions);

        $readerPermissions = collect(PermissionEnum::cases())
            ->filter(fn (PermissionEnum $permission): bool => str_starts_with($permission->value, 'can-show-'))
            ->map(fn (PermissionEnum $permission): string => $permission->value)
            ->all();

        $reader->syncPermissions($readerPermissions);
    }
}
