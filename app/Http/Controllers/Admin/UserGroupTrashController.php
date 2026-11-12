<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkUserGroupActionRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Models\UserGroup;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;

/**
 * Admin trash for user groups: restore, permanent delete, and bulk actions.
 */
class UserGroupTrashController extends Controller
{
    use AuthorizesWithPermissionTrait;

    /**
     * Restore a soft-deleted user group.
     *
     * Permission only: unlike UserGroupPolicy::restore() (used by the AI tool), the web
     * route does not refuse groups that grant super-admin. Kept as-is in #599, which
     * moves checks without changing behaviour.
     */
    public function restore(UserGroup $group): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanRestoreGroups->value);

        $group->restore();

        return redirect()
            ->route('groups.index', ['trashed' => 1])
            ->with('success', __('User group restored.'));
    }

    /**
     * Permanently delete a soft-deleted user group.
     */
    public function forceDelete(UserGroup $group): RedirectResponse
    {
        abort_unless(Gate::allows('forceDelete', $group), 403);

        $group->forceDelete();

        return redirect()
            ->route('groups.index', ['trashed' => 1])
            ->with('success', __('User group permanently deleted.'));
    }

    /**
     * Run a bulk delete, restore, or force-delete action on selected groups.
     */
    public function bulkActions(BulkUserGroupActionRequest $request): RedirectResponse
    {
        $action = $request->validated('action');
        $ids = $request->validated('ids');

        match ($action) {
            'delete' => UserGroup::query()->whereIn('id', $ids)->delete(),
            'restore' => UserGroup::query()->onlyTrashed()->whereIn('id', $ids)->restore(),
            'force_delete' => UserGroup::query()->onlyTrashed()->whereIn('id', $ids)->forceDelete(),
        };

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }
}
