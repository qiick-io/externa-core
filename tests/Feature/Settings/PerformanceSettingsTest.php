<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\PublicApiResponseCache;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('guests are redirected from performance settings', function () {
    $this->get(route('performance.edit'))->assertRedirect(route('login'));
});

test('users without permission cannot view or flush performance caches', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('performance.edit'))
        ->assertForbidden();

    $this->actingAs($user)
        ->post(route('performance.flush-public-api'))
        ->assertForbidden();

    $this->actingAs($user)
        ->post(route('performance.flush-permission-matrices'))
        ->assertForbidden();

    $this->actingAs($user)
        ->post(route('performance.flush-spatie-permissions'))
        ->assertForbidden();

    $this->actingAs($user)
        ->post(route('performance.flush-dashboard-metrics'))
        ->assertForbidden();
});

test('authorized users can view performance settings with nested props', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $cache = app(PublicApiResponseCache::class);

    $this->actingAs($user)
        ->get(route('performance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/performance')
            ->has('status', fn (AssertableInertia $status) => $status
                ->has('cacheStore')
                ->has('redisReachable')
                ->has('queueConnection')
                ->has('appEnv')
                ->has('appDebug')
                ->where('cacheStore', (string) config('cache.default'))
                ->where('queueConnection', (string) config('queue.default'))
            )
            ->has('bootstrap', fn (AssertableInertia $bootstrap) => $bootstrap
                ->has('configCached')
                ->has('routesCached')
                ->has('eventsCached')
                ->has('packagesCached')
            )
            ->has('publicApi', fn (AssertableInertia $publicApi) => $publicApi
                ->where('ttlSeconds', PublicApiResponseCache::TTL_SECONDS)
                ->where('epoch', $cache->epoch())
            )
            ->has('links', fn (AssertableInertia $links) => $links
                ->where('jobs', null)
                ->where('pulse', null)
                ->where('horizon', null)
            )
        );
});

test('flush public api increments epoch visible in props', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $cache = app(PublicApiResponseCache::class);
    $beforeEpoch = $cache->epoch();
    $beforeVersion = $cache->version(42);

    $this->actingAs($user)
        ->post(route('performance.flush-public-api'))
        ->assertRedirect(route('performance.edit'))
        ->assertSessionHas('success');

    expect($cache->epoch())->toBe($beforeEpoch + 1)
        ->and($cache->version(42))->toBe($beforeVersion + 1_000_000)
        ->and($cache->version(42))->not->toBe($beforeVersion);

    $this->actingAs($user)
        ->get(route('performance.edit'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('publicApi.epoch', $beforeEpoch + 1)
        );
});

test('authorized users can flush dashboard metric keys', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    Cache::put('dashboard:health', ['ok' => true], 60);
    Cache::put('dashboard:file-stats', ['files_count' => 1], 60);

    $this->actingAs($user)
        ->post(route('performance.flush-dashboard-metrics'))
        ->assertRedirect(route('performance.edit'))
        ->assertSessionHas('success');

    expect(Cache::get('dashboard:health'))->toBeNull()
        ->and(Cache::get('dashboard:file-stats'))->toBeNull();
});

test('user with CanShowJobs sees jobs link', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
        PermissionEnum::CanShowJobs->value,
    ]);

    $this->actingAs($user)
        ->get(route('performance.edit'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('links.jobs', url('/settings/jobs'))
            ->where('links.pulse', null)
            ->where('links.horizon', null)
        );
});

test('super-admin sees all observability links', function () {
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $role = Role::query()->firstOrCreate([
        'name' => RoleEnum::SuperAdmin->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $admin->syncRoles([$role]);

    $jobsPermission = \Spatie\Permission\Models\Permission::query()->firstOrCreate([
        'name' => PermissionEnum::CanShowJobs->value,
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $admin->givePermissionTo($jobsPermission);

    $this->actingAs($admin)
        ->get(route('performance.edit'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('links.jobs', url('/settings/jobs'))
            ->where('links.pulse', url('/pulse'))
            ->where('links.horizon', url('/horizon'))
        );
});
