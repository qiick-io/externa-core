<?php

use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageUsers;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Laravel\Ai\Tools\Request;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();

    $this->superAdminRole = Role::query()->where('name', RoleEnum::SuperAdmin->value)->firstOrFail();
    $this->readerRole = Role::query()->where('name', RoleEnum::Reader->value)->firstOrFail();

    $this->userManager = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowUsers->value,
        PermissionEnum::CanCreateUsers->value,
        PermissionEnum::CanEditUsers->value,
        PermissionEnum::CanDeleteUsers->value,
        PermissionEnum::CanShowGroups->value,
        PermissionEnum::CanCreateGroups->value,
        PermissionEnum::CanEditGroups->value,
        PermissionEnum::CanDeleteGroups->value,
    ]);

    $this->superAdminGroup = UserGroup::query()->create(['name' => 'Owners', 'slug' => 'owners']);
    $this->superAdminGroup->roles()->sync([$this->superAdminRole->id]);
});

test('user manager cannot grant themselves super-admin directly or through a group', function () {
    $this->actingAs($this->userManager);

    $this->put(route('users.update', $this->userManager), ['role_ids' => [$this->superAdminRole->id]])
        ->assertSessionHasErrors('role_ids');

    $this->put(route('users.update', $this->userManager), ['group_ids' => [$this->superAdminGroup->id]])
        ->assertSessionHasErrors('group_ids');

    expect($this->userManager->fresh()->hasRole(RoleEnum::SuperAdmin->value))->toBeFalse()
        ->and($this->userManager->fresh()->groups()->count())->toBe(0);
});

test('user manager cannot create a super-admin account or group', function () {
    $this->actingAs($this->userManager);

    $this->post(route('users.store'), [
        'first_name' => 'Mallory',
        'email' => 'mallory@example.com',
        'password' => 'correct-horse-battery-staple-42',
        'role_ids' => [$this->superAdminRole->id],
    ])->assertSessionHasErrors('role_ids');

    $this->post(route('groups.store'), [
        'name' => 'Shadow owners',
        'user_ids' => [$this->userManager->id],
        'role_ids' => [$this->superAdminRole->id],
    ])->assertSessionHasErrors('role_ids');

    expect(User::query()->where('email', 'mallory@example.com')->exists())->toBeFalse()
        ->and(UserGroup::query()->where('name', 'Shadow owners')->exists())->toBeFalse();
});

test('user manager cannot edit, delete, or bulk delete a super-admin', function () {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole($this->superAdminRole);
    $this->actingAs($this->userManager);

    $this->put(route('users.update', $superAdmin), ['email' => 'taken-over@example.com'])->assertForbidden();
    $this->delete(route('users.destroy', $superAdmin))->assertForbidden();
    $this->post(route('users.bulk-actions'), ['action' => 'delete', 'ids' => [$superAdmin->id]])
        ->assertSessionHasErrors('ids');

    expect($superAdmin->fresh())->not->toBeNull()
        ->and($superAdmin->fresh()->email)->not->toBe('taken-over@example.com')
        ->and($superAdmin->fresh()->trashed())->toBeFalse();
});

test('group manager cannot edit or delete a group that grants super-admin', function () {
    $this->actingAs($this->userManager);

    $this->put(route('groups.update', $this->superAdminGroup), [
        'name' => 'Owners',
        'user_ids' => [$this->userManager->id],
    ])->assertForbidden();
    $this->delete(route('groups.destroy', $this->superAdminGroup))->assertForbidden();

    expect($this->superAdminGroup->users()->count())->toBe(0)
        ->and($this->superAdminGroup->fresh()->trashed())->toBeFalse();
});

test('user manager can still assign ordinary roles', function () {
    $target = User::factory()->create();
    $this->actingAs($this->userManager);

    $this->put(route('users.update', $target), ['role_ids' => [$this->readerRole->id]])
        ->assertSessionHasNoErrors();

    expect($target->fresh()->hasRole(RoleEnum::Reader->value))->toBeTrue();
});

test('super-admin can grant super-admin', function () {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole($this->superAdminRole);
    $target = User::factory()->create();
    $this->actingAs($superAdmin);

    $this->put(route('users.update', $target), ['role_ids' => [$this->superAdminRole->id]])
        ->assertSessionHasNoErrors();

    expect($target->fresh()->hasRole(RoleEnum::SuperAdmin->value))->toBeTrue();
});

test('AI tools refuse super-admin grants and super-admin targets for non super-admins', function () {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole($this->superAdminRole);
    $this->actingAs($this->userManager);

    $grant = (string) (new ManageUsers)->handle(new Request([
        'action' => 'update',
        'user_id' => $this->userManager->id,
        'role_names_json' => json_encode([RoleEnum::SuperAdmin->value]),
    ]));
    $takeover = (string) (new ManageUsers)->handle(new Request([
        'action' => 'update',
        'user_id' => $superAdmin->id,
        'email' => 'taken-over@example.com',
    ]));
    $publicRole = (string) (new ManageUsers)->handle(new Request([
        'action' => 'update',
        'user_id' => $this->userManager->id,
        'role_names_json' => json_encode([RoleEnum::Public->value]),
    ]));
    $group = (string) (new ManageGroups)->handle(new Request([
        'action' => 'update',
        'group_id' => $this->superAdminGroup->id,
        'user_ids_json' => json_encode([$this->userManager->id]),
    ]));

    expect($grant)->toContain('Only a super-admin can grant super-admin access')
        ->and($takeover)->toContain('Only a super-admin can modify a super-admin account')
        ->and($publicRole)->toContain('One or more role names are invalid')
        ->and($group)->toContain('Only a super-admin can change a group that grants super-admin')
        ->and($this->userManager->fresh()->hasRole(RoleEnum::SuperAdmin->value))->toBeFalse()
        ->and($superAdmin->fresh()->email)->not->toBe('taken-over@example.com')
        ->and($this->superAdminGroup->users()->count())->toBe(0);
});
