<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

/**
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

test('authorized users can list groups with search and pagination', function () {
    $this->withoutVite();

    $user = User::factory()->create();
    grantGroupPermissions($user, [PermissionEnum::CanShowGroups]);
    $this->actingAs($user);

    UserGroup::factory()->create(['name' => 'Editors', 'created_by' => $user->id]);
    UserGroup::factory()->create(['name' => 'Support team', 'created_by' => $user->id]);

    $this->get(route('groups.index', ['search' => 'editor']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/groups/index')
            ->has('groups.data', 1)
            ->where('groups.data.0.name', 'Editors')
            ->has('groups.data.0.roles')
            ->where('filters.search', 'editor'));
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
});

test('authorized users can bulk delete groups', function () {
    $user = User::factory()->create();
    grantGroupPermissions($user, [
        PermissionEnum::CanShowGroups,
        PermissionEnum::CanDeleteGroups,
    ]);
    $this->actingAs($user);

    $groups = UserGroup::factory()->count(2)->create(['created_by' => $user->id]);

    $this->delete(route('groups.bulk-destroy'), [
        'ids' => $groups->pluck('id')->all(),
    ])->assertRedirect(route('groups.index'));

    expect(UserGroup::query()->count())->toBe(0);
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
