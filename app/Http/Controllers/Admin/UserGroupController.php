<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkUserGroupActionRequest;
use App\Http\Requests\Admin\StoreUserGroupRequest;
use App\Http\Requests\Admin\UpdateUserGroupRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Resources\UserGroupResource;
use App\Models\Role;
use App\Models\UserGroup;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin CRUD and bulk actions for user groups and their memberships.
 */
class UserGroupController extends Controller
{
    use AuthorizesWithPermission;

    /**
     * @var list<string>
     */
    private const SORTABLE_COLUMNS = ['name', 'created_at', 'updated_at'];

    /**
     * List user groups with search, trash, sort, and role assignment context.
     */
    public function index(Request $request): Response
    {
        $search = $request->string('search')->trim()->toString();
        $sort = $request->string('sort')->toString();
        $direction = strtolower($request->string('direction')->toString()) === 'desc' ? 'desc' : 'asc';

        if (! in_array($sort, self::SORTABLE_COLUMNS, true)) {
            $sort = 'name';
        }

        $query = UserGroup::query()
            ->with([
                'roles:id,name',
                'users:id,first_name,last_name,email',
            ])
            ->withCount(['users', 'roles']);

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $paginator = $query
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        $paginator->setCollection(
            $paginator->getCollection()->map(
                fn (UserGroup $group): array => (new UserGroupResource($group))->toArray($request)
            )
        );

        return Inertia::render('admin/groups/index', [
            'groups' => $paginator,
            'filters' => [
                'search' => $search,
                'trashed' => $request->boolean('trashed'),
                'sort' => $sort,
                'direction' => $direction,
            ],
            'roles' => Role::query()->where('is_assignable', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    /**
     * Create a user group and sync members and roles.
     */
    public function store(StoreUserGroupRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $group = UserGroup::query()->create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        $group->users()->sync($request->input('user_ids', []));
        $group->roles()->sync($request->input('role_ids', []));

        return redirect()->route('groups.index')
            ->with('success', __('User group created.'));
    }

    /**
     * Update a user group and optionally sync members and roles.
     */
    public function update(UpdateUserGroupRequest $request, UserGroup $group): RedirectResponse
    {
        $validated = $request->validated();

        $group->update([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
        ]);

        // Only sync when the key is present (empty array = intentional clear).
        if (array_key_exists('user_ids', $validated)) {
            $group->users()->sync($validated['user_ids'] ?? []);
        }

        if (array_key_exists('role_ids', $validated)) {
            $group->roles()->sync($validated['role_ids'] ?? []);
        }

        return redirect()->route('groups.index')
            ->with('success', __('User group updated.'));
    }

    /**
     * Soft-delete a user group.
     */
    public function destroy(UserGroup $group): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanDeleteGroups->value);

        $group->delete();

        return redirect()->route('groups.index')
            ->with('success', __('User group deleted.'));
    }

    /**
     * Restore a soft-deleted user group.
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
        $this->authorizePermission(PermissionEnum::CanForceDeleteGroups->value);

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
