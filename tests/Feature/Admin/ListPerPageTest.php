<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\User;
use App\Models\UserGroup;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Inertia\Testing\AssertableInertia;

/**
 * "Rows per page" (`per_page`): only 10 / 20 / 50 / 100 are honoured, anything
 * else falls back to 20, on every admin list wired to ValidatesListPerPageTrait.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('honours the allowed page sizes on the users list', function (int $perPage): void {
    User::factory()->count(110)->create();

    $this->get(route('users.index', ['per_page' => $perPage]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/users/index')
            ->where('users.meta.per_page', $perPage)
            ->has('users.data', $perPage));
})->with([10, 20, 50, 100]);

it('falls back to 20 rows for a missing or unsupported per_page', function (?string $perPage): void {
    User::factory()->count(30)->create();

    $this->get(route('users.index', array_filter(['per_page' => $perPage], fn ($value) => $value !== null)))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('users.meta.per_page', 20)
            ->has('users.data', 20));
})->with([
    'missing' => null,
    'not in the set' => '15',
    'too large' => '1000',
    'zero' => '0',
    'negative' => '-10',
    'not a number' => 'abc',
]);

it('keeps per_page in the pagination links with the other filters', function (): void {
    User::factory()->count(60)->create();

    $this->get(route('users.index', ['per_page' => 50, 'sort' => 'email', 'direction' => 'asc']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('users.meta.last_page', 2)
            ->where('users.meta.links.2.url', fn (string $url) => str_contains($url, 'per_page=50')
                && str_contains($url, 'sort=email')
                && str_contains($url, 'page=2')));
});

it('applies the page size to groups', function (): void {
    UserGroup::factory()->count(25)->create();

    $this->get(route('groups.index', ['per_page' => 10]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('groups.per_page', 10)
            ->has('groups.data', 10));

    $this->get(route('groups.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('groups.per_page', 20)
            ->has('groups.data', 20));
});

it('paginates the collections list with the shared page sizes', function (): void {
    Collection::factory()->count(25)->create();

    $this->get(route('collections.index'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/collections/index')
            ->has('collections', 20)
            ->where('pagination.per_page', 20)
            ->where('pagination.total', 25)
            ->where('pagination.last_page', 2));

    $this->get(route('collections.index', ['per_page' => 10, 'page' => 3]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('collections', 5)
            ->where('pagination.current_page', 3)
            ->where('pagination.per_page', 10));

    $this->get(route('collections.index', ['per_page' => 7]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('pagination.per_page', 20));
});
