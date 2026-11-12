<?php

declare(strict_types=1);

namespace App\Actions\Roles;

use App\Models\Role;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * Replace a role's Spatie permissions, shared by the role create, update, and duplicate routes.
 */
final class SyncRolePermissionsAction
{
    /**
     * Replace a role's permissions and flush the permission cache.
     *
     * Side effects: clears the Spatie permission cache and writes a `permissions_synced` activity entry.
     *
     * @param  list<int>  $permissionIds
     */
    public function execute(Role $role, array $permissionIds): void
    {
        $permissions = Permission::query()->whereIn('id', $permissionIds)->get();
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        activity()
            ->performedOn($role)
            ->event('permissions_synced')
            ->withProperties([
                'permission_ids' => $permissions->pluck('id')->values()->all(),
                'permission_names' => $permissions->pluck('name')->values()->all(),
            ])
            ->log('Role permissions synced');
    }
}
