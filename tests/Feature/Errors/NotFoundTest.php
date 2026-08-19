<?php

use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guest 404 on web routes redirects to login', function () {
    $this->get('/this-route-does-not-exist')
        ->assertRedirect(route('login'));
});

test('authenticated 404 renders inertia page inside app layout', function () {
    $user = User::factory()->create();
    $role = Role::query()->create([
        'name' => 'nf-dash-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);
    $user->syncRoles([$role]);

    $this->actingAs($user)
        ->get('/this-route-does-not-exist')
        ->assertNotFound()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('errors/not-found')
            ->where('status', 404)
            ->where('homeUrl', '/dashboard'));
});

test('missing collection redirects to collections list with flash error', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $collection = Collection::factory()->create();
    $collectionId = $collection->id;
    $collection->delete();

    $this->actingAs($user)
        ->get(route('collections.fields.index', ['collection' => $collectionId]))
        ->assertRedirect(route('collections.index'))
        ->assertSessionHas('error', 'This collection no longer exists.');
});

test('api 404 keeps default json response', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/this-endpoint-does-not-exist')
        ->assertNotFound()
        ->assertJsonStructure(['message']);
});
