<?php

use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;

function grantBrowserPaginationPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-pagination-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('keeps activity log page 2 after the search debounce window', function () {
    $user = grantBrowserPaginationPermissions(User::factory()->create(), [
        PermissionEnum::CanShowActivityLogs->value,
    ]);

    Activity::query()->delete();

    foreach (range(1, 26) as $index) {
        activity()
            ->causedBy($user)
            ->event('created')
            ->log("Pagination activity {$index}");
    }

    $this->actingAs($user);

    $page = visit('/activity-logs');

    $page->assertSee('Activity Log')
        ->assertSee('Pagination activity')
        ->assertNoJavaScriptErrors()
        ->click('2')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertNoJavaScriptErrors();
});

it('paginates permissions under settings', function () {
    $user = grantBrowserPaginationPermissions(User::factory()->create(), [
        PermissionEnum::CanShowPermissions->value,
    ]);

    $this->actingAs($user);

    $page = visit('/settings/permissions');

    $page->assertSee('Permissions are defined')
        ->assertNoJavaScriptErrors()
        ->click('2')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertPathIs('/settings/permissions')
        ->assertNoJavaScriptErrors();
});

it('paginates users without bouncing to page 1', function () {
    $user = grantBrowserPaginationPermissions(User::factory()->create(), [
        PermissionEnum::CanShowUsers->value,
    ]);

    User::factory()->count(20)->create();

    $this->actingAs($user);

    $page = visit('/users');

    $page->assertSee('Users')
        ->assertNoJavaScriptErrors()
        ->click('2')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertNoJavaScriptErrors();
});

it('paginates groups without bouncing to page 1', function () {
    $user = grantBrowserPaginationPermissions(User::factory()->create(), [
        PermissionEnum::CanShowGroups->value,
    ]);

    UserGroup::factory()->count(20)->create();

    $this->actingAs($user);

    $page = visit('/groups');

    $page->assertSee('Slug')
        ->assertNoJavaScriptErrors()
        ->click('2')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertNoJavaScriptErrors();
});

it('paginates roles without bouncing to page 1', function () {
    $user = grantBrowserPaginationPermissions(User::factory()->create(), [
        PermissionEnum::CanShowRoles->value,
    ]);

    foreach (range(1, 20) as $index) {
        Role::query()->create([
            'name' => 'pagination-role-'.$index.'-'.uniqid(),
            'guard_name' => config('auth.defaults.guard', 'web'),
        ]);
    }

    $this->actingAs($user);

    $page = visit('/settings/roles');

    $page->assertSee('Name')
        ->assertNoJavaScriptErrors()
        ->click('2')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertPathIs('/settings/roles')
        ->assertNoJavaScriptErrors();
});

it('paginates collection items without bouncing to page 1', function () {
    $user = grantBrowserPaginationPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);

    $collection = Collection::factory()->create([
        'name' => 'Pagination Posts',
        'slug' => 'pagination-posts-'.uniqid(),
    ]);

    CollectionItem::factory()->count(20)->create([
        'collection_id' => $collection->id,
    ]);

    $this->actingAs($user);

    $page = visit('/collections/'.$collection->id.'/items');

    $page->assertSee('Data preview')
        ->assertNoJavaScriptErrors()
        ->click('2')
        ->wait(1)
        ->assertQueryStringHas('page', '2')
        ->assertNoJavaScriptErrors();
});
