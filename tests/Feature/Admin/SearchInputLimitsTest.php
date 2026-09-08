<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Support\Validation\StringLimits;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function grantSearchCapPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-search-cap-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

test('admin search over max length returns 422', function (string $routeName, string $permission) {
    $actor = grantSearchCapPermissions(User::factory()->create(), [$permission]);
    $this->actingAs($actor);

    $this->getJson(route($routeName, [
        'search' => str_repeat('a', StringLimits::SEARCH + 1),
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['search']);
})->with([
    'users' => ['users.index', PermissionEnum::CanShowUsers->value],
    'roles' => ['roles.index', PermissionEnum::CanShowRoles->value],
    'groups' => ['groups.index', PermissionEnum::CanShowGroups->value],
    'activity-logs' => ['activity-logs.index', PermissionEnum::CanShowActivityLogs->value],
]);

test('user group description over max length returns 422', function () {
    $actor = grantSearchCapPermissions(User::factory()->create(), [
        PermissionEnum::CanCreateGroups->value,
    ]);
    $this->actingAs($actor);

    $this->post(route('groups.store'), [
        'name' => 'Too long desc '.uniqid(),
        'description' => str_repeat('d', StringLimits::DESCRIPTION + 1),
    ])->assertSessionHasErrors('description');
});
