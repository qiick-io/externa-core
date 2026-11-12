<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Roles\SyncRolePermissionsAction;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreRoleRequest;
use App\Http\Requests\Admin\UpdateRoleRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Concerns\ValidatesListPerPageTrait;
use App\Http\Requests\Concerns\ValidatesSearchQueryTrait;
use App\Http\Resources\Admin\RoleResource;
use App\Models\Role;
use App\Services\Api\CollectionPermissionSyncService;
use App\Services\Api\FilePermissionSyncService;
use App\Services\Authorization\PermissionGrouperService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * Admin create, edit, and permission assignment for application roles.
 *
 * Duplicating lives in {@see RoleDuplicateController}, deleting in {@see RoleDeletionController}.
 */
class RoleController extends Controller
{
    use AuthorizesWithPermissionTrait;
    use ValidatesListPerPageTrait;
    use ValidatesSearchQueryTrait;

    public function __construct(
        private readonly SyncRolePermissionsAction $syncRolePermissions,
        private readonly PermissionGrouperService $permissionGrouper,
        private readonly CollectionPermissionSyncService $collectionPermissionSync,
        private readonly FilePermissionSyncService $filePermissionSync,
    ) {}

    /**
     * List roles with search and sort filters.
     */
    public function index(Request $request): Response|JsonResponse
    {
        abort_unless(Gate::allows('viewAny', Role::class), 403);

        $search = $this->validatedSearch($request);

        $query = Role::query();

        if ($request->expectsJson()) {
            $query->where('is_assignable', true);
        } else {
            $query->withCount('permissions');
        }

        if ($search !== '') {
            $term = '%'.$search.'%';
            $like = $query->getModel()->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
            $query->where('name', $like, $term);
        }

        $sortColumn = $request->string('sort')->toString();
        $sortDirection = $request->string('direction', 'asc')->toString() === 'desc' ? 'desc' : 'asc';

        if (in_array($sortColumn, ['name', 'created_at', 'updated_at'], true)) {
            $query->orderBy($sortColumn, $sortDirection);
        } else {
            $query->orderBy('name');
        }

        $roles = $query
            ->paginate($this->validatedListPerPage($request))
            ->withQueryString();

        if ($request->expectsJson()) {
            return RoleResource::collection($roles)->response($request);
        }

        return Inertia::render('admin/roles/index', [
            'roles' => RoleResource::collection($roles),
            'filters' => [
                'search' => $search,
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
        abort_unless(Gate::allows('create', Role::class), 403);

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

        $this->syncRolePermissions->execute($role, $data['permission_ids'] ?? []);

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
     * Suggest a unique clone name: `{source}-copy`, `{source}-copy-2`, …
     */
    public static function uniqueDuplicateRoleName(string $sourceName): string
    {
        $guard = config('auth.defaults.guard', 'web');
        $candidate = $sourceName.'-copy';
        $suffix = 2;

        while (Role::query()->where('guard_name', $guard)->where('name', $candidate)->exists()) {
            $candidate = $sourceName.'-copy-'.$suffix;
            $suffix++;
        }

        return $candidate;
    }

    /**
     * Render the edit-role form for the given role.
     *
     * Permission only: RolePolicy::update() refuses any super-admin role update that
     * does not repeat its name (UpdateRoleRequest's rule), so the form cannot reuse it.
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

        Gate::authorize('update', [$role, $data['name'] ?? null]);

        if (! $role->isLockedSystemRole() && array_key_exists('name', $data)) {
            $role->update(['name' => $data['name']]);
        }

        if (! $role->isPublic() && array_key_exists('permission_ids', $data)) {
            $this->syncRolePermissions->execute($role, $data['permission_ids']);
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
