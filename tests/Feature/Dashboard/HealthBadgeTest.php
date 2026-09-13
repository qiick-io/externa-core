<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Dashboard\DashboardHealthMetrics;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Cache::flush();
});

test('dashboard health metrics badge returns ok warn or fail', function () {
    $badge = app(DashboardHealthMetrics::class)->badge();

    expect($badge)->toHaveKeys(['status', 'label'])
        ->and($badge['status'])->toBeIn(['ok', 'warn', 'fail'])
        ->and($badge['label'])->toBeString()->not->toBeEmpty();
});

test('authenticated inertia pages share healthBadge', function () {
    $role = Role::query()->firstOrCreate([
        'name' => 'test-health-badge-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanShowDashboard->value]);

    $user = User::factory()->create();
    $user->syncRoles([$role]);
    $this->actingAs($user);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('healthBadge.status')
            ->has('healthBadge.label'));
});
