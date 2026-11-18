<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\FileUpload;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Database\Eloquent\Model;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Role;

function grantDashboardPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-dashboard-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    $this->withoutVite();
});

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users without permission cannot visit the dashboard', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('dashboard'))->assertForbidden();
});

test('authorized users can visit the dashboard', function () {
    $user = grantDashboardPermissions(User::factory()->create(), [
        PermissionEnum::CanShowDashboard->value,
    ]);
    $this->actingAs($user);

    activity()
        ->causedBy($user)
        ->event('created')
        ->log('Created something');

    activity()
        ->causedBy($user)
        ->event('failed')
        ->log('Failed login');

    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'largest-file.bin',
        'path' => '/largest-file.bin',
        'disk' => 'assets',
        'size' => 123456789,
    ]);

    // forceCreate: the backdated timestamps are not mass assignable.
    FileUpload::query()->forceCreate([
        'upload_id' => 'test-upload-1',
        'file_name' => 'orphan-upload.txt',
        'mime_type' => 'text/plain',
        'total_size' => 1234,
        'total_chunks' => 10,
        'uploaded_chunks' => 2,
        'disk' => 'assets',
        'parent_id' => null,
        'chunks_info' => null,
        'expires_at' => now()->addMinutes(10),
        'created_at' => now()->subHours(2),
        'updated_at' => now()->subHours(2),
    ]);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard')
            ->has('latestActivity')
            ->has('fileStats', fn (AssertableInertia $props) => $props
                ->has('files_count')
                ->has('folders_count')
                ->has('files_size_sum'))
            ->has('uploadHealth', fn (AssertableInertia $props) => $props
                ->has('in_progress_count')
                ->has('stale_count'))
            ->has('mostActiveUsers', fn (AssertableInertia $items) => $items
                ->each(fn (AssertableInertia $item) => $item
                    ->has('id')
                    ->has('label')
                    ->has('activity_count')
                    ->etc()))
            ->has('suspiciousEvents', fn (AssertableInertia $items) => $items
                ->each(fn (AssertableInertia $item) => $item
                    ->has('id')
                    ->has('event')
                    ->has('description')
                    ->has('created_at')
                    ->etc()))
            ->has('stuckOrphanUploads', fn (AssertableInertia $items) => $items
                ->each(fn (AssertableInertia $item) => $item
                    ->has('id')
                    ->has('upload_id')
                    ->has('file_name')
                    ->has('disk')
                    ->has('uploaded_chunks')
                    ->has('total_chunks')
                    ->has('expires_at')
                    ->has('created_at')
                    ->etc()))
            ->has('largestFiles', fn (AssertableInertia $items) => $items
                ->each(fn (AssertableInertia $item) => $item
                    ->has('id')
                    ->has('name')
                    ->has('path')
                    ->has('disk')
                    ->has('size')
                    ->has('created_at')
                    ->etc()))
            ->has('storageTrend', fn (AssertableInertia $items) => $items
                ->each(fn (AssertableInertia $item) => $item
                    ->has('date')
                    ->has('bytes_added')
                    ->etc()))
            ->has('collectionCounts')
            ->has('activityOverTime', fn (AssertableInertia $items) => $items
                ->each(fn (AssertableInertia $item) => $item
                    ->has('date')
                    ->has('count')
                    ->etc()))
            ->has('contentEventBreakdown', fn (AssertableInertia $props) => $props
                ->has('created')
                ->has('updated')
                ->has('deleted'))
            ->has('health', fn (AssertableInertia $props) => $props
                ->has('queue_connection')
                ->has('broadcast_connection')
                ->has('pulse_enabled')
                ->has('pulse_ingest')
                ->has('pulse_available')
                ->has('redis_ok')
                ->has('failed_jobs')
                ->has('pending_jobs')
                ->has('exceptions_24h')
                ->has('slow_jobs_24h')
                ->has('slow_queries_24h')
                ->has('horizon', fn (AssertableInertia $horizon) => $horizon
                    ->has('available')
                    ->has('status')
                    ->has('masters')
                    ->has('processes')
                    ->has('pending')
                    ->has('failed')
                    ->has('jobs_per_minute')
                    ->has('throughput')
                    ->has('workloads')
                    ->etc())
                ->etc()));
});

test('dashboard health props include pulse and horizon aggregates', function () {
    $user = grantDashboardPermissions(User::factory()->create(), [
        PermissionEnum::CanShowDashboard->value,
    ]);
    $this->actingAs($user);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard')
            ->has('health.exceptions_24h')
            ->has('health.slow_queries_24h')
            ->has('health.horizon.available')
            ->missing('health.pulse_path')
            ->missing('health.horizon_path')
            ->missing('health.can_view_pulse')
            ->missing('health.can_view_horizon'));
});

test('dashboard insights include collection item counts', function () {
    $user = grantDashboardPermissions(User::factory()->create(), [
        PermissionEnum::CanShowDashboard->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Places', 'slug' => 'places']);
    CollectionItem::factory()->count(2)->create(['collection_id' => $collection->id]);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard')
            ->has('collectionCounts', fn (AssertableInertia $items) => $items
                ->where('0.name', 'Places')
                ->where('0.items_count', 2)
                ->etc()));
});

test('super-admin can visit the dashboard', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    // Gate::before grants super-admin every permission, so the dashboard renders in full.
    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard')
            ->has('collectionCounts'));
});

test('dashboard views have their own URLs', function () {
    $user = grantDashboardPermissions(User::factory()->create(), [
        PermissionEnum::CanShowDashboard->value,
    ]);
    $this->actingAs($user);

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page->where('view', 'overview'));

    $this->get(route('dashboard.view', ['view' => 'health']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('dashboard')
            ->where('view', 'health'));

    $this->get('/dashboard/unknown')->assertNotFound();
});

test('old dashboard tab links redirect to the view URL', function () {
    $user = grantDashboardPermissions(User::factory()->create(), [
        PermissionEnum::CanShowDashboard->value,
    ]);
    $this->actingAs($user);

    $this->get('/dashboard?tab=health')
        ->assertRedirect(route('dashboard.view', ['view' => 'health']));
});

test('users without permission cannot open a dashboard view', function () {
    $this->actingAs(User::factory()->create());

    $this->get(route('dashboard.view', ['view' => 'health']))->assertForbidden();
});

test('the deferred file stats by disk load under strict models', function () {
    // File eager loads currentVersion by default; an aggregate select without
    // current_version_id threw MissingAttributeException here (strict models).
    expect(Model::preventsAccessingMissingAttributes())->toBeTrue();

    $user = grantDashboardPermissions(User::factory()->create(), [
        PermissionEnum::CanShowDashboard->value,
    ]);
    $this->actingAs($user);

    foreach ([100, 50] as $index => $size) {
        File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => "stat-{$index}.bin",
            'path' => "/stat-{$index}.bin",
            'disk' => 'assets',
            'size' => $size,
        ]);
    }

    $this->get(route('dashboard'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->missing('fileStatsByDisk')
            ->loadDeferredProps('storage', fn (AssertableInertia $reload) => $reload
                ->where('fileStatsByDisk', [
                    ['disk' => 'assets', 'files_count' => 2, 'files_size_sum' => 150],
                ])));
});
