<?php

use App\Enums\PermissionEnum;
use Illuminate\Support\Facades\Artisan;
use Spatie\Permission\Models\Permission;

test('permission sync creates database rows for every enum case', function () {
    Artisan::call('permissions:sync');

    expect(Permission::query()->count())->toBe(count(PermissionEnum::cases()));

    foreach (PermissionEnum::values() as $permissionName) {
        expect(Permission::query()->where('name', $permissionName)->exists())->toBeTrue();
    }
});

test('permission sync with prune removes stale permissions', function () {
    Artisan::call('permissions:sync');

    Permission::query()->create([
        'name' => 'can-obsolete-module',
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);

    Artisan::call('permissions:sync', ['--prune' => true]);

    expect(Permission::query()->where('name', 'can-obsolete-module')->exists())->toBeFalse();
});
