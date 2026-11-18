<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserGroupRequest;
use App\Http\Requests\Admin\UpdateUserGroupRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Http\Requests\Concerns\ValidatesSearchQueryTrait;
use App\Http\Resources\UserGroupResource;
use App\Models\Role;
use App\Models\UserGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin list, create, edit, and soft delete for user groups and their memberships.
 *
 * Restore, permanent delete, and bulk actions live in {@see UserGroupTrashController}.
 */
class UserGroupController extends Controller
{
    use AuthorizesWithPermissionTrait;
    use ValidatesListPerPageTrait;
    use ValidatesSearchQueryTrait;

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
        abort_unless(Gate::allows('viewAny', UserGroup::class), 403);

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
            $like = $query->getModel()->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
            $query->where(function ($builder) use ($search, $like): void {
                $builder->where('name', $like, "%{$search}%")
                    ->orWhere('description', $like, "%{$search}%");
            });
        }

        $paginator = $query
            ->orderBy($sort, $direction)
            ->paginate($this->validatedListPerPage($request))
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
        abort_unless(Gate::allows('delete', $group), 403);

        $group->delete();

        return redirect()->route('groups.index')
            ->with('success', __('User group deleted.'));
    }
}
