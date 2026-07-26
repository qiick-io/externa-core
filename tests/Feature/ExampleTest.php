<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

test('guest visiting home is redirected to login', function () {
    $response = $this->get(route('home'));

    $response->assertRedirect(route('login'));
});

test('authenticated user with dashboard permission is redirected to dashboard', function () {
    $this->seed(PermissionSeeder::class);
    $user = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'home-dashboard-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);
    $user->syncRoles([$role]);

    $response = $this->actingAs($user)->get(route('home'));

    $response->assertRedirect('/dashboard');
});

test('authenticated user without dashboard lands on first allowed surface', function () {
    $this->seed(PermissionSeeder::class);
    $user = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'home-files-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowFiles->value]);
    $user->syncRoles([$role]);

    $response = $this->actingAs($user)->get(route('home'));

    $response->assertRedirect('/files');
});
