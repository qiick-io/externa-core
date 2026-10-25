<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkUserGroupActionRequest;
use App\Http\Requests\Admin\StoreUserGroupRequest;
use App\Http\Requests\Admin\UpdateUserGroupRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Requests\Concerns\ValidatesSearchQuery;
use App\Http\Resources\UserGroupResource;
use App\Models\Role;
use App\Models\UserGroup;
use Illuminate\Http\JsonResponse;
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
    use ValidatesSearchQuery;

    /**
     * @var list<string>
     */
    private const SORTABLE_COLUMNS = ['name', 'created_at', 'updated_at'];

    /**
     * List user groups with search, trash, sort, and role assignment context.
     * JSON Accept returns a paginated resource for multi-select pickers.
     */
    public function index(Request $request): Response|JsonResponse
    {
        $this->authorizePermission(PermissionEnum::CanShowGroups->value);

        $search = $this->validatedSearch($request);
        $sort = $request->string('sort')->toString();
        $direction = strtolower($request->string('direction')->toString()) === 'desc' ? 'desc' : 'asc';
        $wantsJson = $request->expectsJson();

        if (! in_array($sort, self::SORTABLE_COLUMNS, true)) {
            $sort = 'name';
        }

        $query = UserGroup::query()->withCount(['users', 'roles']);

        if (! $wantsJson) {
            $query->with([
                'roles:id,name',
                'users:id,first_name,last_name,email',
            ]);
        }

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }

        if ($search !== '') {
            $like = $query->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
            $query->where(function ($builder) use ($search, $like): void {
                $builder->where('name', $like, "%{$search}%")
                    ->orWhere('description', $like, "%{$search}%");
            });
        }

        $paginator = $query
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        if ($wantsJson) {
            return UserGroupResource::collection($paginator)->response($request);
        }

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

        $userIds = array_values(array_map('intval', $request->input('user_ids', [])));
        $roleIds = array_values(array_map('intval', $request->input('role_ids', [])));
        $group->users()->sync($userIds);
        $group->roles()->sync($roleIds);

        activity()
            ->performedOn($group)
            ->event('members_synced')
            ->withProperties(['user_ids' => $userIds])
            ->log('Group members synced');

        activity()
            ->performedOn($group)
            ->event('roles_synced')
            ->withProperties(['role_ids' => $roleIds])
            ->log('Group roles synced');

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
            $userIds = array_values(array_map('intval', $validated['user_ids'] ?? []));
            $group->users()->sync($userIds);

            activity()
                ->performedOn($group)
                ->event('members_synced')
                ->withProperties(['user_ids' => $userIds])
                ->log('Group members synced');
        }

        if (array_key_exists('role_ids', $validated)) {
            $roleIds = array_values(array_map('intval', $validated['role_ids'] ?? []));
            $group->roles()->sync($roleIds);

            activity()
                ->performedOn($group)
                ->event('roles_synced')
                ->withProperties(['role_ids' => $roleIds])
                ->log('Group roles synced');
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
