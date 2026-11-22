<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Roles\DeleteRoleAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkRoleActionRequest;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Spatie\Permission\PermissionRegistrar;

/**
 * Delete application roles, one at a time or in bulk; protected roles and roles still
 * referenced by API keys are refused or skipped (#833).
 */
class RoleDeletionController extends Controller
{
    /**
     * Delete a role unless it is protected or still referenced by API keys.
     */
    public function destroy(Role $role, DeleteRoleAction $deleteRoleAction): RedirectResponse
    {
        Gate::authorize('delete', $role);

        $deleteRoleAction->execute($role);

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role deleted.'));
    }

    /**
     * Bulk-delete roles, skipping protected roles and roles that API keys still use.
     */
    public function bulkActions(BulkRoleActionRequest $request, DeleteRoleAction $deleteRoleAction): RedirectResponse
    {
        $result = $deleteRoleAction->executeMany($request->deletableIds());
        $skippedApiKeyCount = $request->skippedApiKeyRoleCount() + $result['skippedForeignKey'];

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->back()
            ->with('success', $this->bulkDeleteFlashMessage($result['deleted'], $skippedApiKeyCount));
    }

    private function bulkDeleteFlashMessage(int $deletedCount, int $skippedApiKeyCount): string
    {
        if ($skippedApiKeyCount === 0) {
            return __('Bulk action completed.');
        }

        if ($deletedCount === 0) {
            return __(':skipped role(s) skipped because API keys still use them.', [
                'skipped' => $skippedApiKeyCount,
            ]);
        }

        return __(':deleted role(s) deleted. :skipped role(s) skipped because API keys still use them.', [
            'deleted' => $deletedCount,
            'skipped' => $skippedApiKeyCount,
        ]);
    }
}
