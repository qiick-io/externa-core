<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ManageGroups;
use App\Ai\Tools\ManageRoles;
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
});

test('manage roles tool is registered when user can show roles', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowRoles->value,
    ]);

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->all();

    expect($tools)->toContain('ManageRoles');
});

test('manage roles creates role with synced permissions', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanShowPermissions->value,
    ]);
    $this->actingAs($user);

    $list = (string) (new ManageRoles)->handle(new Request([
        'action' => 'list_permissions',
        'query' => 'collections',
    ]));

    expect($list)->toContain('can-show-collections')
        ->and($list)->not->toContain('Permesso mancante');

    $result = (string) (new ManageRoles)->handle(new Request([
        'action' => 'create',
        'name' => 'product-manager',
        'permission_names_json' => json_encode([
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanCreateCollections->value,
            PermissionEnum::CanEditCollections->value,
        ]),
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('product-manager')
        ->and($result)->toContain(PermissionEnum::CanShowCollections->value);

    $role = Role::query()->where('name', 'product-manager')->first();
    expect($role)->not->toBeNull()
        ->and($role->hasPermissionTo(PermissionEnum::CanShowCollections->value))->toBeTrue()
        ->and($role->hasPermissionTo(PermissionEnum::CanCreateCollections->value))->toBeTrue();
});

test('manage roles denies create without permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowRoles->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageRoles)->handle(new Request([
        'action' => 'create',
        'name' => 'blocked-role',
    ]));

    expect($result)->toContain('Permesso mancante')
        ->and(Role::query()->where('name', 'blocked-role')->exists())->toBeFalse();
});

test('manage roles cannot delete or rename super-admin', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanEditRoles->value,
        PermissionEnum::CanDeleteRoles->value,
    ]);
    $this->actingAs($user);

    $superAdmin = Role::query()->where('name', RoleEnum::SuperAdmin->value)->firstOrFail();

    $rename = (string) (new ManageRoles)->handle(new Request([
        'action' => 'update',
        'role_id' => $superAdmin->id,
        'name' => 'not-super-admin',
    ]));

    $delete = (string) (new ManageRoles)->handle(new Request([
        'action' => 'delete',
        'role_id' => $superAdmin->id,
    ]));

    expect($rename)->toContain('cannot be renamed')
        ->and($delete)->toContain('cannot be deleted')
        ->and(Role::query()->where('name', RoleEnum::SuperAdmin->value)->exists())->toBeTrue();
});

test('manage roles updates permissions and deletes custom role', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
        PermissionEnum::CanDeleteRoles->value,
    ]);
    $this->actingAs($user);

    $create = json_decode((string) (new ManageRoles)->handle(new Request([
        'action' => 'create',
        'name' => 'temp-editor',
        'permission_names_json' => json_encode([PermissionEnum::CanShowCollections->value]),
    ])), true);

    $roleId = $create['role']['id'];

    $update = (string) (new ManageRoles)->handle(new Request([
        'action' => 'update',
        'role_id' => $roleId,
        'permission_names_json' => json_encode([
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanEditCollections->value,
        ]),
    ]));

    expect($update)->toContain('"ok": true')
        ->and($update)->toContain(PermissionEnum::CanEditCollections->value);

    $delete = (string) (new ManageRoles)->handle(new Request([
        'action' => 'delete',
        'role_id' => $roleId,
    ]));

    expect($delete)->toContain('"ok": true')
        ->and(Role::query()->whereKey($roleId)->exists())->toBeFalse();
});

test('manage groups creates group with roles and members', function () {
    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateGroups->value,
        PermissionEnum::CanShowGroups->value,
    ]);
    $member = User::factory()->create();
    $this->actingAs($actor);

    $result = (string) (new ManageGroups)->handle(new Request([
        'action' => 'create',
        'name' => 'Catalog team',
        'description' => 'Owns catalog content',
        'role_names_json' => json_encode([RoleEnum::Reader->value]),
        'user_ids_json' => json_encode([$member->id]),
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('Catalog team');

    $group = UserGroup::query()->where('name', 'Catalog team')->first();
    expect($group)->not->toBeNull()
        ->and($group->roles()->pluck('name')->all())->toContain(RoleEnum::Reader->value)
        ->and($group->users()->pluck('users.id')->all())->toContain($member->id);
});

test('manage groups denies create without permission and supports soft delete restore', function () {
    $denied = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowGroups->value,
    ]);
    $this->actingAs($denied);

    $blocked = (string) (new ManageGroups)->handle(new Request([
        'action' => 'create',
        'name' => 'Nope',
    ]));

    expect($blocked)->toContain('Permesso mancante');

    $actor = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateGroups->value,
        PermissionEnum::CanDeleteGroups->value,
        PermissionEnum::CanRestoreGroups->value,
    ]);
    $this->actingAs($actor);

    $created = json_decode((string) (new ManageGroups)->handle(new Request([
        'action' => 'create',
        'name' => 'Soft group',
    ])), true);

    $groupId = $created['group']['id'];

    $deleted = (string) (new ManageGroups)->handle(new Request([
        'action' => 'delete',
        'group_id' => $groupId,
    ]));

    expect($deleted)->toContain('"ok": true')
        ->and(UserGroup::query()->find($groupId))->toBeNull()
        ->and(UserGroup::query()->onlyTrashed()->find($groupId))->not->toBeNull();

    $restored = (string) (new ManageGroups)->handle(new Request([
        'action' => 'restore',
        'group_id' => $groupId,
    ]));

    expect($restored)->toContain('"ok": true')
        ->and(UserGroup::query()->find($groupId))->not->toBeNull();
});

test('app assistant registers manage groups for group permissions', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowGroups->value,
    ]);

    $tools = collect((new AppAssistant($user))->tools())
        ->map(fn ($tool): string => class_basename($tool))
        ->all();

    expect($tools)->toContain('ManageGroups')
        ->and($tools)->not->toContain('ManageRoles');
});
