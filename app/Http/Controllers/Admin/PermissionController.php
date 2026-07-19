<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StorePermissionRequest;
use App\Http\Requests\Admin\UpdatePermissionRequest;
use App\Http\Requests\Concerns\AuthorizesWithPermission;
use App\Http\Resources\Admin\PermissionResource;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * Admin CRUD and sync actions for Spatie permission records.
 */
class PermissionController extends Controller
{
    use AuthorizesWithPermission;

    /**
     * List permissions with search and sort filters.
     */
    public function index(Request $request): Response
    {
        $this->authorizePermission(PermissionEnum::CanShowPermissions->value);

        $query = Permission::query();

        if ($search = $request->string('search')->trim()->toString()) {
            $term = '%'.$search.'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('name', 'like', $term)
                    ->orWhere('guard_name', 'like', $term);
            });
        }

        $sortColumn = $request->string('sort')->toString();
        $sortDirection = $request->string('direction', 'asc')->toString() === 'desc' ? 'desc' : 'asc';

        if (in_array($sortColumn, ['name', 'guard_name', 'created_at'], true)) {
            $query->orderBy($sortColumn, $sortDirection);
        } else {
            $query->orderBy('name');
        }

        $permissions = $query
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return Inertia::render('admin/permissions/index', [
            'permissions' => PermissionResource::collection($permissions),
            'filters' => [
                'search' => $search ?? '',
                'sort' => in_array($sortColumn, ['name', 'guard_name', 'created_at'], true) ? $sortColumn : 'name',
                'direction' => $sortDirection,
            ],
        ]);
    }

    /**
     * Create a permission and flush the permission cache.
     */
    public function store(StorePermissionRequest $request): RedirectResponse
    {
        $data = $request->validated();

        Permission::query()->create([
            'name' => $data['name'],
            'guard_name' => $data['guard_name'] ?? config('auth.defaults.guard', 'web'),
        ]);

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->route('permissions.index')
            ->with('success', __('Permission created.'));
    }

    /**
     * Update a permission and flush the permission cache.
     */
    public function update(UpdatePermissionRequest $request, Permission $permission): RedirectResponse
    {
        $permission->update($request->validated());

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->route('permissions.index')
            ->with('success', __('Permission updated.'));
    }

    /**
     * Delete a permission and flush the permission cache.
     */
    public function destroy(Permission $permission): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanDeletePermissions->value);

        $permission->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return redirect()
            ->route('permissions.index')
            ->with('success', __('Permission deleted.'));
    }

    /**
     * Run the permissions sync artisan command, optionally pruning stale records.
     */
    public function sync(Request $request): RedirectResponse
    {
        $this->authorizePermission(PermissionEnum::CanEditPermissions->value);

        Artisan::call('permissions:sync', [
            '--prune' => $request->boolean('prune'),
        ]);

        return redirect()
            ->route('permissions.index')
            ->with('success', __('Permissions synchronized.'));
    }
}
