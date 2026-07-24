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

    FileUpload::query()->create([
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
                ->has('deleted')));
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

    $this->get(route('dashboard'))->assertOk();
});
