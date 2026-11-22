<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkRoleActionRequest;
use App\Models\Role;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
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
     *
     * Wrapped in a transaction so Spatie's permission detach rolls back if the
     * `api_keys.role_id` restrict FK refuses the DELETE.
     */
    public function destroy(Role $role): RedirectResponse
    {
        Gate::authorize('delete', $role);

        DB::transaction(function () use ($role): void {
            $role->delete();
        });

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role deleted.'));
    }

    /**
     * Bulk-delete roles, skipping protected roles and roles that API keys still use.
     *
     * Each delete runs in its own transaction. A late FK refusal (race with a new key)
     * counts as a skip instead of a 500.
     */
    public function bulkActions(BulkRoleActionRequest $request): RedirectResponse
    {
        $ids = $request->deletableIds();
        $skippedApiKeyCount = $request->skippedApiKeyRoleCount();
        $deletedCount = 0;

        foreach ($ids as $roleId) {
            try {
                DB::transaction(function () use ($roleId): void {
                    $role = Role::query()->find($roleId);

                    if ($role === null) {
                        return;
                    }

                    $role->delete();
                });
                $deletedCount++;
            } catch (QueryException $exception) {
                if (! $this->isForeignKeyConstraintViolation($exception)) {
                    throw $exception;
                }

                $skippedApiKeyCount++;
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->back()
            ->with('success', $this->bulkDeleteFlashMessage($deletedCount, $skippedApiKeyCount));
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

    /**
     * True when the engine refused a DELETE because a foreign key still references the row.
     */
    private function isForeignKeyConstraintViolation(QueryException $exception): bool
    {
        $sqlState = $exception->errorInfo[0] ?? null;
        $driverCode = $exception->errorInfo[1] ?? null;

        if ($sqlState === '23503') {
            return true;
        }

        if ($sqlState === '23000' && in_array($driverCode, [1451, 19], true)) {
            return true;
        }

        return str_contains(strtolower($exception->getMessage()), 'foreign key');
    }
}
