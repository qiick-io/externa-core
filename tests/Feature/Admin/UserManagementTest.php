<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Role;

function grantUserPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-user-manager-'.uniqid(),
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

test('guests cannot access admin users', function () {
    $this->get(route('users.index'))->assertRedirect(route('login'));
});

test('users without permission cannot list users', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('users.index'))->assertForbidden();
});

test('authorized users can list users with filters and relationships', function () {
    $actor = grantUserPermissions(User::factory()->create(), [
        PermissionEnum::CanShowUsers->value,
    ]);
    $this->actingAs($actor);

    $target = User::factory()->create([
        'first_name' => 'Zelda',
        'email' => 'zelda@example.com',
    ]);

    $group = UserGroup::query()->create(['name' => 'Ops', 'slug' => 'ops']);
    $role = Role::query()->firstOrCreate([
        'name' => 'ops-role',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $target->groups()->attach($group);
    $target->assignRole($role);

    $this->get(route('users.index', [
        'search' => 'zelda',
        'sort' => 'email',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/users/index')
            ->has('users.data', 1)
            ->where('filters.search', 'zelda')
            ->where('filters.sort', 'email')
            ->where('filters.direction', 'asc'));

    $this->get(route('users.index', [
        'sort' => 'first_name',
        'direction' => 'desc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('filters.sort', 'first_name')
            ->where('filters.direction', 'desc'));

    $this->get(route('users.index', [
        'sort' => 'created_at',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('filters.sort', 'created_at')
            ->where('filters.direction', 'asc'));

    $trashed = User::factory()->create();
    $trashed->delete();

    $this->get(route('users.index', ['trashed' => 1]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('filters.trashed', true)
            ->has('users.data'));
});

test('authorized users can create update and sync roles and groups', function () {
    $actor = grantUserPermissions(User::factory()->create(), [
        PermissionEnum::CanCreateUsers->value,
        PermissionEnum::CanEditUsers->value,
    ]);
    $this->actingAs($actor);

    $role = Role::query()->firstOrCreate([
        'name' => 'editor',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $group = UserGroup::query()->create(['name' => 'Editors', 'slug' => 'editors']);

    $this->post(route('users.store'), [
        'first_name' => 'New',
        'last_name' => 'Person',
        'email' => 'new.person@example.com',
        'username' => 'newperson',
        'password' => 'password',
        'is_active' => true,
        'role_ids' => [$role->id],
        'group_ids' => [$group->id],
    ])->assertRedirect(route('users.index'));

    $created = User::query()->where('email', 'new.person@example.com')->first();

    expect($created)->not->toBeNull()
        ->and($created->hasRole('editor'))->toBeTrue()
        ->and($created->groups()->pluck('user_groups.id')->all())->toBe([$group->id]);

    $this->put(route('users.update', $created), [
        'first_name' => 'Updated',
        'password' => 'new-password',
        'role_ids' => [],
        'group_ids' => [],
    ])->assertRedirect(route('users.index'));

    $created->refresh();

    expect($created->first_name)->toBe('Updated')
        ->and($created->roles)->toBeEmpty()
        ->and($created->groups)->toBeEmpty()
        ->and(Hash::check('new-password', $created->password))->toBeTrue();
});

test('creating user requires role and valid email', function () {
    $actor = grantUserPermissions(User::factory()->create(), [
        PermissionEnum::CanCreateUsers->value,
    ]);
    $this->actingAs($actor);

    $this->from(route('users.index'))
        ->post(route('users.store'), [
            'first_name' => 'New',
            'email' => 'not-an-email',
            'password' => 'password',
            'role_ids' => [],
        ])
        ->assertRedirect(route('users.index'))
        ->assertSessionHasErrors([
            'email' => 'Enter a valid email address.',
            'role_ids' => 'Select at least one role.',
        ]);
});

test('authorized users can soft delete restore force delete and bulk manage users', function () {
    $actor = grantUserPermissions(User::factory()->create(), [
        PermissionEnum::CanDeleteUsers->value,
        PermissionEnum::CanRestoreUsers->value,
        PermissionEnum::CanForceDeleteUsers->value,
    ]);
    $this->actingAs($actor);

    $victim = User::factory()->create();
    $bulk = User::factory()->count(2)->create();

    $this->delete(route('users.destroy', $victim))
        ->assertRedirect(route('users.index'));

    expect($victim->fresh()->trashed())->toBeTrue();

    $this->post(route('users.restore', $victim))
        ->assertRedirect(route('users.index', ['trashed' => 1]));

    expect($victim->fresh()->trashed())->toBeFalse();

    $victim->delete();

    $this->delete(route('users.force-delete', $victim))
        ->assertRedirect(route('users.index', ['trashed' => 1]));

    expect(User::query()->find($victim->id))->toBeNull();

    $this->post(route('users.bulk-actions'), [
        'action' => 'delete',
        'ids' => $bulk->pluck('id')->all(),
    ])->assertRedirect();

    expect(User::query()->whereIn('id', $bulk->pluck('id'))->count())->toBe(0);
});

test('super admin can manage users without explicit permissions', function () {
    Role::query()->firstOrCreate([
        'name' => RoleEnum::SuperAdmin->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($superAdmin);

    $this->get(route('users.index'))->assertOk();

    $this->post(route('users.store'), [
        'first_name' => 'Super',
        'email' => 'super.created@example.com',
        'password' => 'password',
    ])->assertRedirect(route('users.index'));
});

test('users index returns json for multi-select pickers', function () {
    $actor = grantUserPermissions(User::factory()->create(), [
        PermissionEnum::CanShowUsers->value,
    ]);
    $this->actingAs($actor);

    $target = User::factory()->create([
        'first_name' => 'Picker',
        'email' => 'picker.user@example.com',
    ]);

    $this->getJson(route('users.index', ['search' => 'picker.user', 'per_page' => 20]))
        ->assertOk()
        ->assertJsonPath('data.0.id', $target->id)
        ->assertJsonPath('data.0.email', 'picker.user@example.com')
        ->assertJsonStructure(['data', 'links', 'meta']);
});
