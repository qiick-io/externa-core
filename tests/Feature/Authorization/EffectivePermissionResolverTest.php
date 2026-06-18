<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Authorization\EffectivePermissionResolver;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Spatie\Permission\Models\Role;

test('effective permission resolver unions direct roles and group roles', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $resolver = app(EffectivePermissionResolver::class);

    $directRole = Role::query()->firstOrCreate([
        'name' => 'direct-editor',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $directRole->syncPermissions([PermissionEnum::CanEditUsers->value]);

    $groupRole = Role::query()->firstOrCreate([
        'name' => 'group-viewer',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $groupRole->syncPermissions([PermissionEnum::CanShowCollections->value]);

    $user = User::factory()->create();
    $user->assignRole($directRole);

    $group = UserGroup::query()->create([
        'name' => 'Editors',
        'slug' => 'editors',
    ]);
    $group->roles()->attach($groupRole);
    $user->groups()->attach($group);

    $permissions = $resolver->permissionsFor($user);

    expect($permissions)->toContain(PermissionEnum::CanEditUsers->value)
        ->and($permissions)->toContain(PermissionEnum::CanShowCollections->value);

    expect($resolver->roleNamesFor($user))->toContain('direct-editor', 'group-viewer');
});

test('super admin resolver exposes all enum permissions and role name', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);

    $resolver = app(EffectivePermissionResolver::class);

    expect($resolver->isSuperAdmin($user))->toBeTrue()
        ->and($resolver->permissionsFor($user))->toEqual(PermissionEnum::values())
        ->and($resolver->hasPermission($user, PermissionEnum::CanForceDeleteCollections->value))->toBeTrue()
        ->and($resolver->roleNamesFor($user))->toContain(RoleEnum::SuperAdmin->value);
});

test('reader without extra roles only receives show permissions from role', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $readerRole = Role::query()->firstOrCreate([
        'name' => RoleEnum::Reader->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    $readerRole->syncPermissions(
        collect(PermissionEnum::cases())
            ->filter(fn (PermissionEnum $permission): bool => str_starts_with($permission->value, 'can-show-'))
            ->map(fn (PermissionEnum $permission): string => $permission->value)
            ->all(),
    );

    $user = User::factory()->create();
    $user->assignRole($readerRole);

    $resolver = app(EffectivePermissionResolver::class);

    expect($resolver->hasPermission($user, PermissionEnum::CanShowUsers->value))->toBeTrue()
        ->and($resolver->hasPermission($user, PermissionEnum::CanDeleteUsers->value))->toBeFalse();
});
