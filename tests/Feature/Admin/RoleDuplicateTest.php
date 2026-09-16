<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FilePermissionAction;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Http\Controllers\Admin\RoleController;
use App\Models\Collection;
use App\Models\CollectionPermission;
use App\Models\FilePermission;
use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Permission;

function grantDuplicateActor(array $permissions): User
{
    $role = Role::query()->create([
        'name' => 'dup-actor-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->syncPermissions($permissions);

    $user = User::factory()->create();
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('authorized user can duplicate a role with permissions and matrices', function () {
    $actor = grantDuplicateActor([
        PermissionEnum::CanShowRoles->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
    ]);
    $this->actingAs($actor);

    $source = Role::query()->create([
        'name' => 'editor',
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $permission = Permission::query()->where('name', PermissionEnum::CanShowUsers->value)->firstOrFail();
    $source->syncPermissions([$permission]);

    $collection = Collection::factory()->create(['name' => 'Articles', 'slug' => 'articles-dup']);

    CollectionPermission::query()->create([
        'role_id' => $source->id,
        'collection_id' => $collection->id,
        'action' => CollectionPermissionAction::Read->value,
        'allowed' => true,
        'rules' => [
            'fields' => [
                'title' => ['read' => true, 'create' => false, 'update' => false],
            ],
            'item_filter' => null,
        ],
    ]);

    FilePermission::query()->create([
        'role_id' => $source->id,
        'action' => FilePermissionAction::Read->value,
        'allowed' => true,
    ]);

    $member = User::factory()->create();
    $member->assignRole($source);

    $group = UserGroup::factory()->create(['name' => 'Editors group']);
    $group->roles()->sync([$source->id]);

    $this->post(route('roles.duplicate', $source), [
        'name' => 'editor-copy',
    ])->assertRedirect(route('roles.edit', Role::query()->where('name', 'editor-copy')->firstOrFail()));

    $clone = Role::query()->where('name', 'editor-copy')->firstOrFail();

    expect($clone->is_system)->toBeFalse()
        ->and($clone->is_assignable)->toBeTrue()
        ->and($clone->hasPermissionTo(PermissionEnum::CanShowUsers->value))->toBeTrue()
        ->and($clone->users()->count())->toBe(0)
        ->and($group->fresh()->roles()->whereKey($clone->id)->exists())->toBeFalse()
        ->and($source->users()->count())->toBe(1);

    expect(
        CollectionPermission::query()
            ->where('role_id', $clone->id)
            ->where('collection_id', $collection->id)
            ->where('action', CollectionPermissionAction::Read->value)
            ->where('allowed', true)
            ->exists()
    )->toBeTrue();

    expect(
        FilePermission::query()
            ->where('role_id', $clone->id)
            ->where('action', FilePermissionAction::Read->value)
            ->where('allowed', true)
            ->exists()
    )->toBeTrue();
});

test('duplicate role name must be unique', function () {
    $actor = grantDuplicateActor([PermissionEnum::CanCreateRoles->value]);
    $this->actingAs($actor);

    $source = Role::query()->create([
        'name' => 'writer',
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    Role::query()->create([
        'name' => 'writer-copy',
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $this->from(route('roles.index'))
        ->post(route('roles.duplicate', $source), [
            'name' => 'writer-copy',
        ])
        ->assertSessionHasErrors('name');

    expect(Role::query()->where('name', 'writer-copy')->count())->toBe(1);
});

test('unique duplicate role name helper increments suffixes', function () {
    Role::query()->create(['name' => 'analyst', 'guard_name' => 'web']);
    Role::query()->create(['name' => 'analyst-copy', 'guard_name' => 'web']);
    Role::query()->create(['name' => 'analyst-copy-2', 'guard_name' => 'web']);

    expect(RoleController::uniqueDuplicateRoleName('analyst'))->toBe('analyst-copy-3');
});

test('system roles cannot be duplicated', function () {
    $actor = grantDuplicateActor([PermissionEnum::CanCreateRoles->value]);
    $this->actingAs($actor);

    $superAdmin = Role::query()->firstOrCreate(
        ['name' => RoleEnum::SuperAdmin->value, 'guard_name' => 'web'],
        ['is_system' => true, 'is_assignable' => true],
    );
    $superAdmin->forceFill(['is_system' => true])->save();

    $public = Role::query()->firstOrCreate(
        ['name' => RoleEnum::Public->value, 'guard_name' => 'web'],
        ['is_system' => true, 'is_assignable' => false],
    );
    $public->forceFill(['is_system' => true, 'is_assignable' => false])->save();

    $this->post(route('roles.duplicate', $superAdmin), [
        'name' => 'super-admin-copy',
    ])->assertForbidden();

    $this->post(route('roles.duplicate', $public), [
        'name' => 'public-copy',
    ])->assertForbidden();

    expect(Role::query()->where('name', 'super-admin-copy')->exists())->toBeFalse()
        ->and(Role::query()->where('name', 'public-copy')->exists())->toBeFalse();
});

test('duplicate requires can-create-roles', function () {
    $actor = grantDuplicateActor([PermissionEnum::CanShowRoles->value]);
    $this->actingAs($actor);

    $source = Role::query()->create([
        'name' => 'viewer',
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $this->post(route('roles.duplicate', $source), [
        'name' => 'viewer-copy',
    ])->assertForbidden();
});
