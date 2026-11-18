<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Roles\SyncRolePermissionsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\DuplicateRoleRequest;
use App\Models\Role;
use App\Services\Api\CollectionPermissionSyncService;
use App\Services\Api\FilePermissionSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Spatie\Permission\PermissionRegistrar;

/**
 * Clone an application role into a new, editable role.
 */
class RoleDuplicateController extends Controller
{
    public function __construct(
        private readonly SyncRolePermissionsAction $syncRolePermissions,
        private readonly CollectionPermissionSyncService $collectionPermissionSync,
        private readonly FilePermissionSyncService $filePermissionSync,
    ) {}

    /**
     * Clone Spatie permissions and collection/file matrices into a new role.
     *
     * Does not copy user or group memberships. Locked system sources are rejected.
     */
    public function duplicate(DuplicateRoleRequest $request, Role $role): RedirectResponse
    {
        Gate::authorize('duplicate', $role);

        $data = $request->validated();
        $guard = config('auth.defaults.guard', 'web');

        $clone = Role::query()->create([
            'name' => $data['name'],
            'guard_name' => $guard,
            'is_system' => false,
            'is_assignable' => true,
        ]);

        $this->syncRolePermissions->execute(
            $clone,
            $role->permissions()->pluck('id')->map(fn ($id) => (int) $id)->all(),
        );

        $this->collectionPermissionSync->sync(
            $clone,
            $this->collectionPermissionSync->matrixForRole($role),
        );

        $this->filePermissionSync->sync(
            $clone,
            $this->filePermissionSync->matrixForRole($role),
        );

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->route('roles.edit', $clone)
            ->with('success', __('Role duplicated.'));
    }
}
