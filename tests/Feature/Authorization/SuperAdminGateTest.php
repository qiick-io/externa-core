<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

test('super admin bypasses gate checks', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);

    expect(Gate::forUser($user)->allows(PermissionEnum::CanDeleteUsers->value))->toBeTrue()
        ->and(Gate::forUser($user)->allows('non-existent-ability'))->toBeTrue();
});
