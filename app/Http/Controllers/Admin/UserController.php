<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkUserActionRequest;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Resources\Admin\UserResource;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin CRUD and bulk actions for application users, roles, and groups.
 */
class UserController extends Controller
{
    use AuthorizesWithPermission;

    /**
     * @var list<string>
     */
    private const SORTABLE_COLUMNS = [
        'first_name',
        'last_name',
        'email',
        'username',
        'is_active',
        'created_at',
        'updated_at',
    ];

    /**
     * List users with search, trash, and sort filters for the admin index page.
     */
    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowUsers->value);

        $query = User::query()->with(['roles', 'groups']);

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }

        if ($search = $request->string('search')->trim()->toString()) {
            $term = '%'.$search.'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('first_name', 'like', $term)
                    ->orWhere('last_name', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('username', 'like', $term);
            });
        }

        $sortColumn = $request->string('sort')->toString();
        $sortDirection = $request->string('direction', 'desc')->toString() === 'asc' ? 'asc' : 'desc';

        if (in_array($sortColumn, self::SORTABLE_COLUMNS, true)) {
            $query->orderBy($sortColumn, $sortDirection);
        } else {
            $query->latest('id');
        }

        $users = $query
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return Inertia::render('admin/users/index', [
            'users' => UserResource::collection($users),
            'filters' => [
                'search' => $search ?? '',
                'trashed' => $request->boolean('trashed'),
                'sort' => in_array($sortColumn, self::SORTABLE_COLUMNS, true) ? $sortColumn : 'created_at',
                'direction' => $sortDirection,
            ],
        ]);
    }

    /**
     * Create a user and sync optional role and group assignments.
     */
    public function store(StoreUserRequest $request): RedirectResponse
    {
        $data = $request->validated();

        $user = User::query()->create([
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'] ?? null,
            'email' => $data['email'],
            'username' => $data['username'] ?? null,
            'password' => $data['password'],
            'is_active' => $data['is_active'] ?? true,
        ]);

        $this->syncRolesAndGroups($user, $data);

        return redirect()
            ->route('users.index')
            ->with('success', __('User created.'));
    }

    /**
     * Update a user and sync optional role and group assignments.
     */
    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {
        $data = $request->validated();

        $attributes = collect($data)->only([
            'first_name',
            'last_name',
            'email',
            'username',
            'is_active',
        ])->filter(fn ($value) => $value !== null)->all();

        if (! empty($data['password'] ?? null)) {
            $attributes['password'] = $data['password'];
        }

        $user->update($attributes);

        $this->syncRolesAndGroups($user, $data);

        return redirect()
            ->route('users.index')
            ->with('success', __('User updated.'));
    }

    /**
     * Soft-delete a user.
     */
    public function destroy(User $user): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanDeleteUsers->value);

        $user->delete();

        return redirect()
            ->route('users.index')
            ->with('success', __('User deleted.'));
    }

    /**
     * Restore a soft-deleted user.
     */
    public function restore(User $user): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanRestoreUsers->value);

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
        $this->authorizePermission(PermissionEnum::CanForceDeleteUsers->value);

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

    /**
     * Sync role and group relations when the request includes their id lists.
     *
     * @param  array<string, mixed>  $data
     */
    private function syncRolesAndGroups(User $user, array $data): void
    {
        if (array_key_exists('role_ids', $data)) {
            $roles = Role::query()->whereIn('id', $data['role_ids'] ?? [])->get();
            $user->syncRoles($roles);

            activity()
                ->performedOn($user)
                ->event('roles_synced')
                ->withProperties([
                    'role_ids' => $roles->pluck('id')->values()->all(),
                    'role_names' => $roles->pluck('name')->values()->all(),
                ])
                ->log('User roles synced');
        }

        if (array_key_exists('group_ids', $data)) {
            $groupIds = array_values(array_map('intval', $data['group_ids'] ?? []));
            $user->groups()->sync($groupIds);

            activity()
                ->performedOn($user)
                ->event('groups_synced')
                ->withProperties(['group_ids' => $groupIds])
                ->log('User groups synced');
        }
    }
}
