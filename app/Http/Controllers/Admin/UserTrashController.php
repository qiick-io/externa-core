<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkUserActionRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;

/**
 * Admin trash for application users: restore, permanent delete, and bulk actions.
 */
class UserTrashController extends Controller
{
    /**
     * Restore a soft-deleted user.
     */
    public function restore(User $user): RedirectResponse
    {
        abort_unless(Gate::allows('restore', $user), 403);

        $user->restore();

        return redirect()
            ->route('users.index', ['trashed' => 1])
            ->with('success', __('User restored.'));
    }

    /**
     * Permanently delete a soft-deleted user.
     */
    public function forceDelete(User $user): RedirectResponse
    {
        abort_unless(Gate::allows('forceDelete', $user), 403);

        $user->forceDelete();

        return redirect()
            ->route('users.index', ['trashed' => 1])
            ->with('success', __('User permanently deleted.'));
    }

    /**
     * Run a bulk delete, restore, or force-delete action on selected users.
     */
    public function bulkActions(BulkUserActionRequest $request): RedirectResponse
    {
        $action = $request->validated('action');
        $ids = $request->validated('ids');

        match ($action) {
            'delete' => User::query()->whereIn('id', $ids)->delete(),
            'restore' => User::query()->onlyTrashed()->whereIn('id', $ids)->restore(),
            'force_delete' => User::query()->onlyTrashed()->whereIn('id', $ids)->forceDelete(),
        };

        return redirect()
            ->back()
            ->with('success', __('Bulk action completed.'));
    }
}
