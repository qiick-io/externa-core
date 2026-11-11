<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    $this->group = UserGroup::query()->create(['name' => 'Editors']);
    $this->superAdminGroup = UserGroup::query()->create(['name' => 'Owners']);
    $this->superAdminGroup->roles()->sync([Role::findByName(RoleEnum::SuperAdmin->value)->id]);

    $this->manager = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
        PermissionEnum::CanCreateGroups->value,
        PermissionEnum::CanEditGroups->value,
        PermissionEnum::CanDeleteGroups->value,
        PermissionEnum::CanRestoreGroups->value,
        PermissionEnum::CanForceDeleteGroups->value,
    ]);
    $this->outsider = User::factory()->create();
});

test('class abilities follow the route permission', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, UserGroup::class))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->allows($ability, UserGroup::class))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, UserGroup::class))->toBeTrue()
        ->and(Gate::forUser(null)->allows($ability, UserGroup::class))->toBeFalse();
})->with(['viewAny', 'create']);

test('record abilities follow the route permission', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, $this->group))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->allows($ability, $this->group))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, $this->group))->toBeTrue();
})->with(['update', 'delete', 'restore', 'forceDelete']);

test('only a super-admin may touch a group that grants super-admin', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, $this->superAdminGroup))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, $this->superAdminGroup))->toBeTrue();
})->with(['update', 'delete', 'restore', 'forceDelete']);
