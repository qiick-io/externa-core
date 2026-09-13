<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Models\UserGroup;
use App\Support\Auth\HomePath;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('home path prefers dashboard when permitted', function () {
    $user = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'hp-dash-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowDashboard->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $user->syncRoles([$role]);

    expect(HomePath::for($user))->toBe('/dashboard');
});

test('home path respects permissions inherited via groups', function () {
    $user = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'hp-group-files-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowFiles->value]);

    $group = UserGroup::factory()->create();
    $group->roles()->sync([$role->id]);
    $user->groups()->sync([$group->id]);

    expect($user->roles()->count())->toBe(0)
        ->and(HomePath::for($user))->toBe('/files');
});

test('login redirects limited file user to files not dashboard', function () {
    $user = User::factory()->create([
        'email' => 'home-path-limited@example.com',
        'password' => 'password',
    ]);
    $role = Role::query()->create([
        'name' => 'hp-files-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowFiles->value]);
    $user->syncRoles([$role]);

    $response = $this->post('/login', [
        'email' => 'home-path-limited@example.com',
        'password' => 'password',
    ]);

    $response->assertRedirect('/files');
    $this->assertAuthenticatedAs($user);
});

test('login ignores stale intended urls that would 404', function () {
    $user = User::factory()->create([
        'email' => 'home-path-stale@example.com',
        'password' => 'password',
    ]);
    $role = Role::query()->create([
        'name' => 'hp-stale-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);
    $user->syncRoles([$role]);

    $response = $this
        ->withSession(['url.intended' => url('/this-page-does-not-exist-xyz')])
        ->post('/login', [
            'email' => 'home-path-stale@example.com',
            'password' => 'password',
        ]);

    $response->assertRedirect('/dashboard');
    $this->assertAuthenticatedAs($user);
});

test('inertia login returns location header to home', function () {
    $user = User::factory()->create([
        'email' => 'home-path-inertia@example.com',
        'password' => 'password',
    ]);
    $role = Role::query()->create([
        'name' => 'hp-inertia-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);
    $user->syncRoles([$role]);

    $response = $this->withHeaders([
        'X-Inertia' => 'true',
        'X-Requested-With' => 'XMLHttpRequest',
    ])->post('/login', [
        'email' => 'home-path-inertia@example.com',
        'password' => 'password',
    ]);

    $response->assertStatus(409);
    expect($response->headers->get('X-Inertia-Location'))->toEndWith('/dashboard');
    $this->assertAuthenticatedAs($user);
});
