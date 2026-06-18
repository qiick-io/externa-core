<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkRoleActionRequest;
use App\Http\Requests\Admin\StoreRoleRequest;
use App\Http\Requests\Admin\UpdateRoleRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Resources\Admin\RoleResource;
use App\Support\Authorization\PermissionGrouper;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleController extends Controller
{
    use AuthorizesWithPermission;

    public function __construct(
        private readonly PermissionGrouper $permissionGrouper,
    ) {}

    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowRoles->value);

        $query = Role::query()->withCount('permissions');

        if ($search = $request->string('search')->trim()->toString()) {
            $term = '%'.$search.'%';
            $query->where('name', 'like', $term);
        }

        $sortColumn = $request->string('sort')->toString();
        $sortDirection = $request->string('direction', 'asc')->toString() === 'desc' ? 'desc' : 'asc';

        if (in_array($sortColumn, ['name', 'created_at', 'updated_at'], true)) {
            $query->orderBy($sortColumn, $sortDirection);
        } else {
            $query->orderBy('name');
        }

        $roles = $query
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return Inertia::render('admin/roles/index', [
            'roles' => RoleResource::collection($roles),
            'filters' => [
                'search' => $search ?? '',
                'sort' => in_array($sortColumn, ['name', 'created_at', 'updated_at'], true) ? $sortColumn : 'name',
                'direction' => $sortDirection,
            ],
        ]);
    }

    public function create(): Response
    {
        $this->authorizePermission(PermissionEnum::CanCreateRoles->value);

        return Inertia::render('admin/roles/form', $this->roleFormProps());
    }

    public function store(StoreRoleRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $guard = config('auth.defaults.guard', 'web');

        $role = Role::query()->create([
            'name' => $data['name'],
            'guard_name' => $guard,
        ]);

        $this->syncPermissions($role, $data['permission_ids'] ?? []);

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role created.'));
    }

    public function edit(Role $role): Response
    {
        $this->authorizePermission(PermissionEnum::CanEditRoles->value);

        $role->load('permissions');

        return Inertia::render('admin/roles/form', [
            ...$this->roleFormProps(),
            'role' => RoleResource::make($role),
        ]);
    }

    public function update(UpdateRoleRequest $request, Role $role): RedirectResponse
    {
        $data = $request->validated();

        if (array_key_exists('name', $data)) {
            $role->update(['name' => $data['name']]);
        }

        if (array_key_exists('permission_ids', $data)) {
            $this->syncPermissions($role, $data['permission_ids']);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role updated.'));
    }

    public function destroy(Role $role): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanDeleteRoles->value);

        if ($role->name === RoleEnum::SuperAdmin->value) {
            abort(403, 'The super-admin role cannot be deleted.');
        }

        $role->delete();

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role deleted.'));
    }

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

    /**
     * @param  list<int>  $permissionIds
     */
    private function syncPermissions(Role $role, array $permissionIds): void
    {
        $permissions = Permission::query()->whereIn('id', $permissionIds)->get();
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /**
     * @return array<string, mixed>
     */
    private function roleFormProps(): array
    {
        $permissions = Permission::query()->orderBy('name')->get();

        return [
            'permissionGroups' => $this->permissionGrouper->group($permissions),
            'allPermissions' => $permissions->map(fn (Permission $permission) => [
                'id' => $permission->id,
                'name' => $permission->name,
            ])->values()->all(),
        ];
    }
}
