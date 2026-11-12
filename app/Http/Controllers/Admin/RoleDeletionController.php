<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkRoleActionRequest;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Spatie\Permission\PermissionRegistrar;

/**
 * Delete application roles, one at a time or in bulk; protected roles are refused or skipped.
 */
class RoleDeletionController extends Controller
{
    /**
     * Delete a role unless it is a protected system role.
     */
    public function destroy(Role $role): RedirectResponse
    {
        Gate::authorize('delete', $role);

        $role->delete();

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role deleted.'));
    }

    /**
     * Bulk-delete roles, skipping protected roles.
     */
    public function bulkActions(BulkRoleActionRequest $request): RedirectResponse
    {
        $ids = $request->deletableIds();

        if ($ids !== []) {
            Role::query()->whereIn('id', $ids)->delete();
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }
}
