<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkDestroyUserGroupsRequest;
use App\Http\Requests\Admin\StoreUserGroupRequest;
use App\Http\Requests\Admin\UpdateUserGroupRequest;
use App\Http\Resources\UserGroupResource;
use App\Models\UserGroup;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use App\Models\Role;

/**
 * Admin CRUD and bulk delete actions for user groups and their memberships.
 */
class UserGroupController extends Controller
{
    /**
     * @var list<string>
     */
    private const SORTABLE_COLUMNS = ['name', 'created_at', 'updated_at'];

    /**
     * List user groups with search, sort, and role assignment context.
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
            ->with(['roles:id,name'])
            ->withCount(['users', 'roles']);

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

        if ($request->has('user_ids')) {
            $group->users()->sync($request->input('user_ids', []));
        }

        if ($request->has('role_ids')) {
            $group->roles()->sync($request->input('role_ids', []));
        }

        return redirect()->route('groups.index')
            ->with('success', __('User group updated.'));
    }

    /**
     * Delete a user group.
     */
    public function destroy(UserGroup $group): RedirectResponse
    {
        $group->delete();

        return redirect()->route('groups.index')
            ->with('success', __('User group deleted.'));
    }

    /**
     * Delete multiple user groups in one request.
     */
    public function bulkDestroy(BulkDestroyUserGroupsRequest $request): RedirectResponse
    {
        UserGroup::query()->whereIn('id', $request->validated('ids'))->delete();

        return redirect()->route('groups.index')
            ->with('success', __('User groups deleted.'));
    }
}
