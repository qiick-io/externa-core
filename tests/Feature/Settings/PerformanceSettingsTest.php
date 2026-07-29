<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Api\PublicApiResponseCache;
use Database\Seeders\PermissionSeeder;
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

test('authorized users can view performance settings and flush public api cache', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $cache = app(PublicApiResponseCache::class);
    $beforeEpoch = $cache->epoch();
    $beforeVersion = $cache->version(42);

    $this->actingAs($user)
        ->get(route('performance.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/performance')
            ->has('cacheStore')
            ->has('redisReachable')
            ->where('cacheStore', (string) config('cache.default'))
        );

    $this->actingAs($user)
        ->post(route('performance.flush-public-api'))
        ->assertRedirect(route('performance.edit'))
        ->assertSessionHas('success');

    expect($cache->epoch())->toBe($beforeEpoch + 1)
        ->and($cache->version(42))->toBe($beforeVersion + 1_000_000)
        ->and($cache->version(42))->not->toBe($beforeVersion);
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
