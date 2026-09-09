<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Artisan;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

function grantRolePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-role-manager-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('authorized users can manage roles on dedicated inertia pages', function () {
    $actor = grantRolePermissions(User::factory()->create(), [
        PermissionEnum::CanShowRoles->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
        PermissionEnum::CanDeleteRoles->value,
    ]);
    $this->actingAs($actor);

    $permission = Permission::query()->where('name', PermissionEnum::CanShowUsers->value)->first();

    $this->get(route('roles.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page->component('admin/roles/index'));

    $this->get(route('roles.create'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/roles/form')
            ->has('permissionGroups'));

    $this->post(route('roles.store'), [
        'name' => 'content-manager',
        'permission_ids' => [$permission->id],
    ])->assertRedirect(route('roles.index'));

    $role = Role::query()->where('name', 'content-manager')->first();

    expect($role)->not->toBeNull()
        ->and($role->hasPermissionTo(PermissionEnum::CanShowUsers->value))->toBeTrue();

    $this->get(route('roles.edit', $role))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/roles/form')
            ->has('role'));

    $this->put(route('roles.update', $role), [
        'name' => 'content-lead',
        'permission_ids' => [],
    ])->assertRedirect(route('roles.index'));

    $role->refresh();

    expect($role->name)->toBe('content-lead')
        ->and($role->permissions)->toBeEmpty();

    $this->delete(route('roles.destroy', $role))
        ->assertRedirect(route('roles.index'));

    expect(Role::query()->where('name', 'content-lead')->exists())->toBeFalse();
});

test('super admin role cannot be deleted or included in bulk delete', function () {
    $actor = grantRolePermissions(User::factory()->create(), [
        PermissionEnum::CanDeleteRoles->value,
    ]);
    $this->actingAs($actor);

    $superAdminRole = Role::query()->firstOrCreate([
        'name' => RoleEnum::SuperAdmin->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    $this->delete(route('roles.destroy', $superAdminRole))->assertForbidden();

    $deletable = Role::query()->firstOrCreate([
        'name' => 'temporary-role',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    $this->post(route('roles.bulk-actions'), [
        'action' => 'delete',
        'ids' => [$superAdminRole->id, $deletable->id],
    ])->assertRedirect();

    expect(Role::query()->whereKey($superAdminRole->id)->exists())->toBeTrue()
        ->and(Role::query()->whereKey($deletable->id)->exists())->toBeFalse();
});

test('reader cannot access role edit page', function () {
    $reader = User::factory()->create();
    $readerRole = Role::query()->firstOrCreate([
        'name' => RoleEnum::Reader->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $readerRole->syncPermissions([PermissionEnum::CanShowRoles->value]);
    $reader->assignRole($readerRole);
    $this->actingAs($reader);

    $target = Role::query()->firstOrCreate([
        'name' => 'custom',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    $this->get(route('roles.edit', $target))->assertForbidden();
});

test('roles index returns assignable JSON options for picker search', function () {
    $actor = grantRolePermissions(User::factory()->create(), [
        PermissionEnum::CanShowRoles->value,
    ]);
    $this->actingAs($actor);

    Role::query()->create([
        'name' => 'reader-visible',
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_system' => false,
        'is_assignable' => true,
    ]);

    Role::query()->create([
        'name' => 'reader-hidden',
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_system' => true,
        'is_assignable' => false,
    ]);

    $this->getJson(route('roles.index', [
        'search' => 'reader-',
        'per_page' => 20,
    ]))
        ->assertOk()
        ->assertJsonPath('meta.current_page', 1)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'reader-visible')
        ->assertJsonPath('data.0.label', 'Reader Visible')
        ->assertJsonMissing(['name' => 'reader-hidden']);

    // pgsql LIKE is case-sensitive; picker labels are Title Case
    $this->getJson(route('roles.index', [
        'search' => 'Reader-Visible',
        'per_page' => 20,
    ]))
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'reader-visible');
});

test('authorized users can manage permissions and sync from enum', function () {
    $actor = grantRolePermissions(User::factory()->create(), [
        PermissionEnum::CanShowPermissions->value,
        PermissionEnum::CanCreatePermissions->value,
        PermissionEnum::CanEditPermissions->value,
        PermissionEnum::CanDeletePermissions->value,
    ]);
    $this->actingAs($actor);

    $totalPermissions = count(PermissionEnum::cases());
    $perPage = 15;

    $this->get(route('permissions.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/permissions/index')
            ->has('permissions.data', min($perPage, $totalPermissions))
            ->where('permissions.meta.total', $totalPermissions)
            ->where('permissions.meta.per_page', $perPage)
            ->where('permissions.meta.current_page', 1));

    $pageTwoCount = min($perPage, max(0, $totalPermissions - $perPage));

    $this->get(route('permissions.index', ['page' => 2]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/permissions/index')
            ->where('permissions.meta.current_page', 2)
            ->has('permissions.data', $pageTwoCount));

    $this->post(route('permissions.store'), [
        'name' => 'can-custom-action',
    ])->assertRedirect(route('permissions.index'));

    $permission = Permission::query()->where('name', 'can-custom-action')->first();

    $this->put(route('permissions.update', $permission), [
        'name' => 'can-custom-action-updated',
    ])->assertRedirect(route('permissions.index'));

    expect($permission->fresh()->name)->toBe('can-custom-action-updated');

    Artisan::call('permissions:sync');

    $this->post(route('permissions.sync'))
        ->assertRedirect(route('permissions.index'));

    expect(Permission::query()->where('name', PermissionEnum::CanShowUsers->value)->exists())->toBeTrue();

    $this->delete(route('permissions.destroy', $permission))
        ->assertRedirect(route('permissions.index'));

    expect(Permission::query()->whereKey($permission->id)->exists())->toBeFalse();
});

test('legacy access paths redirect under settings', function () {
    $actor = grantRolePermissions(User::factory()->create(), [
        PermissionEnum::CanShowRoles->value,
        PermissionEnum::CanShowPermissions->value,
        PermissionEnum::CanShowApiKeys->value,
    ]);
    $this->actingAs($actor);

    expect(route('roles.index', absolute: false))->toBe('/settings/roles');
    expect(route('permissions.index', absolute: false))->toBe('/settings/permissions');
    expect(route('api-keys.index', absolute: false))->toBe('/settings/api-keys');

    $this->get('/roles')->assertRedirect('/settings/roles');
    $this->get('/permissions')->assertRedirect('/settings/permissions');
    $this->get('/api-keys')->assertRedirect('/settings/api-keys');
});
