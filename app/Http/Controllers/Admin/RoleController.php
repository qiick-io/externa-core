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
use App\Models\Role;
use App\Services\Api\CollectionPermissionSync;
use App\Services\Api\FilePermissionSync;
use App\Support\Authorization\PermissionGrouper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * Admin CRUD, bulk actions, and permission assignment for application roles.
 */
class RoleController extends Controller
{
    use AuthorizesWithPermission;

    public function __construct(
        private readonly PermissionGrouper $permissionGrouper,
        private readonly CollectionPermissionSync $collectionPermissionSync,
        private readonly FilePermissionSync $filePermissionSync,
    ) {}

    /**
     * List roles with search and sort filters.
     */
    public function index(Request $request): Response|JsonResponse
    {
        $this->authorizePermission(PermissionEnum::CanShowRoles->value);

        $query = Role::query()->withCount('permissions');

        if ($request->expectsJson()) {
            $query->where('is_assignable', true);
        }

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

        if ($request->expectsJson()) {
            return RoleResource::collection($roles)->response($request);
        }

        return Inertia::render('admin/roles/index', [
            'roles' => RoleResource::collection($roles),
            'filters' => [
                'search' => $search ?? '',
                'sort' => in_array($sortColumn, ['name', 'created_at', 'updated_at'], true) ? $sortColumn : 'name',
                'direction' => $sortDirection,
            ],
        ]);
    }

    /**
     * Render the create-role form with grouped permission options.
     */
    public function create(): Response
    {
        $this->authorizePermission(PermissionEnum::CanCreateRoles->value);

        return Inertia::render('admin/roles/form', $this->roleFormProps());
    }

    /**
     * Create a role and sync its permissions.
     */
    public function store(StoreRoleRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $guard = config('auth.defaults.guard', 'web');

        $role = Role::query()->create([
            'name' => $data['name'],
            'guard_name' => $guard,
            'is_system' => false,
            'is_assignable' => true,
        ]);

        $this->syncPermissions($role, $data['permission_ids'] ?? []);

        if (array_key_exists('collection_permissions', $data)) {
            $this->collectionPermissionSync->sync($role, $data['collection_permissions'] ?? []);
        }

        if (array_key_exists('file_permissions', $data)) {
            $this->filePermissionSync->sync($role, $data['file_permissions'] ?? []);
        }

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role created.'));
    }

    /**
     * Render the edit-role form for the given role.
     */
    public function edit(Role $role): Response
    {
        $this->authorizePermission(PermissionEnum::CanEditRoles->value);

        $role->load('permissions');

        return Inertia::render('admin/roles/form', [
            ...$this->roleFormProps($role),
            // Resolve JsonResource so Inertia gets a flat object (not { data: ... })
            'role' => (new RoleResource($role))->resolve(),
        ]);
    }

    /**
     * Update a role name and/or permissions.
     */
    public function update(UpdateRoleRequest $request, Role $role): RedirectResponse
    {
        $data = $request->validated();

        if ($role->isLockedSystemRole()) {
            if (array_key_exists('name', $data) && $data['name'] !== $role->name) {
                abort(403, 'System roles cannot be renamed.');
            }
        } elseif (array_key_exists('name', $data)) {
            $role->update(['name' => $data['name']]);
        }

        if (! $role->isPublic() && array_key_exists('permission_ids', $data)) {
            $this->syncPermissions($role, $data['permission_ids']);
        }

        if (array_key_exists('collection_permissions', $data)) {
            $this->collectionPermissionSync->sync($role, $data['collection_permissions'] ?? []);
        }

        if (array_key_exists('file_permissions', $data)) {
            $this->filePermissionSync->sync($role, $data['file_permissions'] ?? []);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role updated.'));
    }

    /**
     * Delete a role unless it is a protected system role.
     */
    public function destroy(Role $role): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanDeleteRoles->value);

        if ($role->name === RoleEnum::SuperAdmin->value || $role->isLockedSystemRole()) {
            abort(403, 'This role cannot be deleted.');
        }

        $role->delete();

        return redirect()
            ->route('roles.index')
            ->with('success', __('Role deleted.'));
    }

    /**
     * Bulk-delete roles, skipping protected roles.
     */
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
     * Replace a role's permissions and flush the permission cache.
     *
     * @param  list<int>  $permissionIds
     */
    private function syncPermissions(Role $role, array $permissionIds): void
    {
        $permissions = Permission::query()->whereIn('id', $permissionIds)->get();
        $role->syncPermissions($permissions);
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        activity()
            ->performedOn($role)
            ->event('permissions_synced')
            ->withProperties([
                'permission_ids' => $permissions->pluck('id')->values()->all(),
                'permission_names' => $permissions->pluck('name')->values()->all(),
            ])
            ->log('Role permissions synced');
    }

    /**
     * Build shared props for the role create/edit Inertia forms.
     *
     * @return array<string, mixed>
     */
    private function roleFormProps(?Role $role = null): array
    {
        $permissions = Permission::query()->orderBy('name')->get();

        return [
            'permissionGroups' => $role?->isPublic()
                ? []
                : $this->permissionGrouper->group($permissions),
            'allPermissions' => $role?->isPublic()
                ? []
                : $permissions->map(fn (Permission $permission) => [
                    'id' => $permission->id,
                    'name' => $permission->name,
                ])->values()->all(),
            'createDirectChatsPermission' => $role?->isPublic()
                ? null
                : $permissions
                    ->firstWhere('name', PermissionEnum::CanCreateDirectChats->value)
                    ?->only(['id', 'name']),
            'collections' => $this->collectionPermissionSync->collectionsPayload(),
            'collectionPermissions' => $role
                ? $this->collectionPermissionSync->matrixForRole($role)
                : [],
            'filePermissions' => $role
                ? $this->filePermissionSync->grantsForRole($role)
                : [
                    'create' => false,
                    'read' => false,
                    'update' => false,
                    'delete' => false,
                ],
        ];
    }
}
