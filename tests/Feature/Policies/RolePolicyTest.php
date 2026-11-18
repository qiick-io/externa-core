<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    $this->role = Role::factory()->create(['name' => 'editor']);
    $this->systemRole = Role::factory()->system()->create(['name' => 'system-role']);
    $this->superAdminRole = Role::findByName(RoleEnum::SuperAdmin->value);

    $this->manager = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanShowRoles->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
        PermissionEnum::CanDeleteRoles->value,
    ]);
    $this->outsider = User::factory()->create();
});

test('class abilities follow the route permission', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, Role::class))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->allows($ability, Role::class))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, Role::class))->toBeTrue()
        ->and(Gate::forUser(null)->allows($ability, Role::class))->toBeFalse();
})->with(['viewAny', 'create']);

test('record abilities follow the route permission with a message-less deny', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, $this->role))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, $this->role))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->inspect($ability, $this->role)->message())->toBeNull();
})->with(['duplicate', 'update', 'delete']);

test('the super-admin role and locked system roles cannot be duplicated or deleted, even by a super-admin', function (string $ability, string $message) {
    foreach ([$this->superAdminRole, $this->systemRole, Role::findByName(RoleEnum::Public->value)] as $protectedRole) {
        expect(Gate::forUser($this->superAdmin)->inspect($ability, $protectedRole)->message())->toBe($message);
    }
})->with([
    ['duplicate', 'This role cannot be duplicated.'],
    ['delete', 'This role cannot be deleted.'],
]);

test('the super-admin role keeps its name, even for a super-admin', function () {
    $gate = Gate::forUser($this->superAdmin);

    expect($gate->inspect('update', [$this->superAdminRole, 'owners'])->message())->toBe('The super-admin role cannot be renamed.')
        ->and($gate->allows('update', [$this->superAdminRole, RoleEnum::SuperAdmin->value]))->toBeTrue();
});

test('an update that does not rename the super-admin role is allowed', function () {
    expect(Gate::forUser($this->manager)->allows('update', [$this->superAdminRole, null]))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('update', [$this->superAdminRole, null]))->toBeTrue();
});

test('locked system roles cannot be renamed but stay editable', function () {
    $gate = Gate::forUser($this->superAdmin);

    expect($gate->inspect('update', [$this->systemRole, 'renamed'])->message())->toBe('System roles cannot be renamed.')
        ->and($gate->allows('update', [$this->systemRole, 'system-role']))->toBeTrue()
        ->and($gate->allows('update', [$this->systemRole, null]))->toBeTrue()
        ->and($gate->allows('update', [$this->role, 'renamed']))->toBeTrue();
});
