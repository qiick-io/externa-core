<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionPermission;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

/**
 * Assign group-management permissions, creating missing permission rows when needed.
 *
 * @param  list<PermissionEnum>  $permissions
 */
function grantGroupPermissions(User $user, array $permissions): void
{
    $role = Role::query()->firstOrCreate([
        'name' => 'groups-manager',
        'guard_name' => 'web',
    ]);

    foreach ($permissions as $permission) {
        Permission::query()->firstOrCreate([
            'name' => $permission->value,
            'guard_name' => 'web',
        ]);
    }

    $role->syncPermissions(array_map(fn (PermissionEnum $permission): string => $permission->value, $permissions));
    $user->assignRole($role);
}

test('guests cannot access user group routes', function () {
    $this->get(route('groups.index'))->assertRedirect(route('login'));
});

test('users without permission cannot manage groups', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('groups.index'))->assertForbidden();
});

test('authorized users can list groups with search pagination and member ids', function () {
    $this->withoutVite();

    $user = User::factory()->create();
    $member = User::factory()->create();
    grantGroupPermissions($user, [PermissionEnum::CanShowGroups]);
    $this->actingAs($user);

    $editors = UserGroup::factory()->create(['name' => 'Editors']);
    $editors->users()->sync([$member->id]);
    UserGroup::factory()->create(['name' => 'Support team']);

    $this->get(route('groups.index', ['search' => 'editor']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/groups/index')
            ->has('groups.data', 1)
            ->where('groups.data.0.name', 'Editors')
            ->has('groups.data.0.roles')
            ->has('groups.data.0.user_ids', 1)
            ->where('groups.data.0.user_ids.0', $member->id)
            ->has('groups.data.0.users', 1)
            ->where('filters.search', 'editor')
            ->where('filters.trashed', false));
});

test('groups index can be sorted by name created_at and updated_at', function () {
    $this->withoutVite();

    $user = User::factory()->create();
    grantGroupPermissions($user, [PermissionEnum::CanShowGroups]);
    $this->actingAs($user);

    $zebra = UserGroup::factory()->create([
        'name' => 'Zebra',
        'updated_at' => now()->subDay(),
    ]);
    $alpha = UserGroup::factory()->create([
        'name' => 'Alpha',
        'updated_at' => now(),
    ]);

    $this->get(route('groups.index', [
        'sort' => 'name',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/groups/index')
            ->where('groups.data.0.id', $alpha->id)
            ->where('groups.data.1.id', $zebra->id)
            ->where('filters.sort', 'name')
            ->where('filters.direction', 'asc'));

    $this->get(route('groups.index', [
        'sort' => 'updated_at',
        'direction' => 'desc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/groups/index')
            ->where('groups.data.0.id', $alpha->id)
            ->where('filters.sort', 'updated_at')
            ->where('filters.direction', 'desc'));

    $this->get(route('groups.index', [
        'sort' => 'created_at',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('filters.sort', 'created_at')
            ->where('filters.direction', 'asc'));
});

test('authorized users can create update and delete groups with pivots', function () {
    $user = User::factory()->create();
    $member = User::factory()->create();
    $role = Role::query()->create(['name' => 'editor', 'guard_name' => 'web']);

    grantGroupPermissions($user, [
        PermissionEnum::CanShowGroups,
        PermissionEnum::CanCreateGroups,
        PermissionEnum::CanEditGroups,
        PermissionEnum::CanDeleteGroups,
    ]);
    $this->actingAs($user);

    $this->post(route('groups.store'), [
        'name' => 'Content',
        'description' => 'Content editors',
        'user_ids' => [$member->id],
        'role_ids' => [$role->id],
    ])->assertRedirect(route('groups.index'));

    $group = UserGroup::query()->where('name', 'Content')->first();
    expect($group)->not->toBeNull();
    expect($group->users()->pluck('users.id')->all())->toContain($member->id);
    expect($group->roles()->pluck('roles.id')->all())->toContain($role->id);

    $this->put(route('groups.update', $group), [
        'name' => 'Content updated',
        'description' => 'Updated',
        'user_ids' => [],
        'role_ids' => [$role->id],
    ])->assertRedirect(route('groups.index'));

    $group->refresh();
    expect($group->name)->toBe('Content updated');
    expect($group->users()->count())->toBe(0);

    $this->delete(route('groups.destroy', $group))
        ->assertRedirect(route('groups.index'));

    expect(UserGroup::query()->whereKey($group->id)->exists())->toBeFalse();
    expect(UserGroup::query()->onlyTrashed()->whereKey($group->id)->exists())->toBeTrue();
});

test('updating a group without user_ids does not wipe members', function () {
    $actor = User::factory()->create();
    $member = User::factory()->create();
    $role = Role::query()->create(['name' => 'keep-role', 'guard_name' => 'web']);

    grantGroupPermissions($actor, [
        PermissionEnum::CanShowGroups,
        PermissionEnum::CanEditGroups,
    ]);
    $this->actingAs($actor);

    $group = UserGroup::factory()->create([
        'name' => 'Stable',
        'description' => 'Before',
    ]);
    $group->users()->sync([$member->id]);
    $group->roles()->sync([$role->id]);

    $this->put(route('groups.update', $group), [
        'name' => 'Stable',
        'description' => 'After',
    ])->assertRedirect(route('groups.index'));

    $group->refresh();
    expect($group->description)->toBe('After')
        ->and($group->users()->pluck('users.id')->all())->toContain($member->id)
        ->and($group->roles()->pluck('roles.id')->all())->toContain($role->id);
});

test('authorized users can soft delete restore force delete and bulk manage groups', function () {
    $actor = User::factory()->create();
    grantGroupPermissions($actor, [
        PermissionEnum::CanShowGroups,
        PermissionEnum::CanDeleteGroups,
        PermissionEnum::CanRestoreGroups,
        PermissionEnum::CanForceDeleteGroups,
    ]);
    $this->actingAs($actor);

    $victim = UserGroup::factory()->create(['name' => 'Victim']);
    $bulk = UserGroup::factory()->count(2)->create();

    $this->delete(route('groups.destroy', $victim))
        ->assertRedirect(route('groups.index'));

    expect($victim->fresh()->trashed())->toBeTrue();

    $this->withoutVite();
    $this->get(route('groups.index', ['trashed' => 1]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/groups/index')
            ->where('filters.trashed', true)
            ->has('groups.data', 1)
            ->where('groups.data.0.name', 'Victim'));

    $this->post(route('groups.restore', $victim))
        ->assertRedirect(route('groups.index', ['trashed' => 1]));

    expect($victim->fresh()->trashed())->toBeFalse();

    $victim->delete();

    $this->delete(route('groups.force-delete', $victim))
        ->assertRedirect(route('groups.index', ['trashed' => 1]));

    expect(UserGroup::query()->withTrashed()->find($victim->id))->toBeNull();

    $this->post(route('groups.bulk-actions'), [
        'action' => 'delete',
        'ids' => $bulk->pluck('id')->all(),
    ])->assertRedirect();

    expect(UserGroup::query()->whereIn('id', $bulk->pluck('id'))->count())->toBe(0);

    $this->post(route('groups.bulk-actions'), [
        'action' => 'restore',
        'ids' => $bulk->pluck('id')->all(),
    ])->assertRedirect();

    expect(UserGroup::query()->whereIn('id', $bulk->pluck('id'))->count())->toBe(2);

    $this->post(route('groups.bulk-actions'), [
        'action' => 'force_delete',
        'ids' => $bulk->pluck('id')->all(),
    ])->assertRedirect();

    // still active — force_delete only applies to trashed
    expect(UserGroup::query()->whereIn('id', $bulk->pluck('id'))->count())->toBe(2);

    UserGroup::query()->whereIn('id', $bulk->pluck('id'))->delete();

    $this->post(route('groups.bulk-actions'), [
        'action' => 'force_delete',
        'ids' => $bulk->pluck('id')->all(),
    ])->assertRedirect();

    expect(UserGroup::query()->withTrashed()->whereIn('id', $bulk->pluck('id'))->count())->toBe(0);
});

test('effective permission resolver unions permissions from multiple groups', function () {
    $actor = User::factory()->create();
    $this->actingAs($actor);

    Permission::query()->firstOrCreate([
        'name' => PermissionEnum::CanShowGroups->value,
        'guard_name' => 'web',
    ]);
    Permission::query()->firstOrCreate([
        'name' => PermissionEnum::CanEditUsers->value,
        'guard_name' => 'web',
    ]);

    $showRole = Role::query()->create(['name' => 'group-show', 'guard_name' => 'web']);
    $showRole->givePermissionTo(PermissionEnum::CanShowGroups->value);

    $editRole = Role::query()->create(['name' => 'group-edit', 'guard_name' => 'web']);
    $editRole->givePermissionTo(PermissionEnum::CanEditUsers->value);

    $groupA = UserGroup::factory()->create(['name' => 'Group A']);
    $groupA->roles()->sync([$showRole->id]);

    $groupB = UserGroup::factory()->create(['name' => 'Group B']);
    $groupB->roles()->sync([$editRole->id]);

    $user = User::factory()->create();
    $user->groups()->sync([$groupA->id, $groupB->id]);

    $resolver = app(EffectivePermissionResolver::class);

    expect($resolver->hasPermission($user, PermissionEnum::CanShowGroups->value))->toBeTrue();
    expect($resolver->hasPermission($user, PermissionEnum::CanEditUsers->value))->toBeTrue();
    expect($resolver->hasPermission($user, PermissionEnum::CanDeleteGroups->value))->toBeFalse();
    expect($resolver->effectiveRoleIds($user))->toEqualCanonicalizing([$showRole->id, $editRole->id]);
});

test('removing a user from a group removes group-derived permissions', function () {
    $actor = User::factory()->create();
    $this->actingAs($actor);

    Permission::query()->firstOrCreate([
        'name' => PermissionEnum::CanShowGroups->value,
        'guard_name' => 'web',
    ]);

    $role = Role::query()->create(['name' => 'group-only', 'guard_name' => 'web']);
    $role->givePermissionTo(PermissionEnum::CanShowGroups->value);

    $group = UserGroup::factory()->create();
    $group->roles()->sync([$role->id]);

    $user = User::factory()->create();
    $user->groups()->sync([$group->id]);

    $resolver = app(EffectivePermissionResolver::class);
    expect($resolver->hasPermission($user, PermissionEnum::CanShowGroups->value))->toBeTrue();

    $user->groups()->sync([]);
    $resolver->forget($user);

    expect($resolver->hasPermission($user, PermissionEnum::CanShowGroups->value))->toBeFalse();
});

test('collection permission rules use group-inherited roles', function () {
    $editorRole = Role::query()->create(['name' => 'acl-editor', 'guard_name' => 'web']);

    $collection = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'posts-acl-group',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);

    CollectionPermission::query()->create([
        'role_id' => $editorRole->id,
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

    app(CollectionPermissionGuard::class)->forget($editorRole->id);

    $group = UserGroup::factory()->create(['name' => 'Editors via group']);
    $group->roles()->sync([$editorRole->id]);

    $user = User::factory()->create();
    $user->groups()->sync([$group->id]);

    expect($user->roles()->count())->toBe(0);

    $rules = app(CollectionPermissionGuard::class)->rulesForUser($user, $collection->id);

    expect($rules)->not->toBeNull()
        ->and($rules['fields']['title']['read'] ?? null)->toBeTrue();

    $outsider = User::factory()->create();
    expect(app(CollectionPermissionGuard::class)->rulesForUser($outsider, $collection->id))->toBeNull();
});
