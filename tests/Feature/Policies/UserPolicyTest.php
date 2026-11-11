<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    $this->target = User::factory()->create();
    $this->manager = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanShowUsers->value,
        PermissionEnum::CanCreateUsers->value,
        PermissionEnum::CanEditUsers->value,
        PermissionEnum::CanDeleteUsers->value,
        PermissionEnum::CanRestoreUsers->value,
        PermissionEnum::CanForceDeleteUsers->value,
    ]);
    $this->outsider = User::factory()->create();
});

test('class abilities follow the route permission', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, User::class))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->allows($ability, User::class))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, User::class))->toBeTrue()
        ->and(Gate::forUser(null)->allows($ability, User::class))->toBeFalse();
})->with(['viewAny', 'create']);

test('record abilities follow the route permission', function (string $ability) {
    expect(Gate::forUser($this->manager)->allows($ability, $this->target))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->allows($ability, $this->target))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, $this->target))->toBeTrue();
})->with(['update', 'delete', 'restore', 'forceDelete']);

test('only a super-admin may touch a super-admin account', function (string $ability) {
    $otherSuperAdmin = User::factory()->create();
    $otherSuperAdmin->assignRole(RoleEnum::SuperAdmin->value);

    expect(Gate::forUser($this->manager)->allows($ability, $otherSuperAdmin))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows($ability, $otherSuperAdmin))->toBeTrue();
})->with(['update', 'delete', 'restore', 'forceDelete']);
