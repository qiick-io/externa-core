<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Breadcrumbs and page titles follow the user's UI
 * locale instead of hard-coded English (i18n lint: externa/no-literal-ui-prop).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create(['locale' => 'it']);
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

it('translates the users breadcrumb', function (): void {
    visit(route('users.index', absolute: false))
        ->assertSeeIn('[data-slot="breadcrumb"]', 'Utenti')
        ->assertDontSeeIn('[data-slot="breadcrumb"]', 'Users')
        ->assertNoJavaScriptErrors();
});

it('translates the items breadcrumb and page title', function (): void {
    $collection = Collection::factory()->create(['name' => 'Events', 'slug' => 'events']);

    visit(route('collections.items.index', $collection, false))
        ->assertSeeIn('[data-slot="breadcrumb"]', 'Collection')
        ->assertSeeIn('[data-slot="breadcrumb"]', 'Item')
        ->assertDontSeeIn('[data-slot="breadcrumb"]', 'Items')
        ->assertScript('() => document.title.startsWith("Item — Events")', true)
        ->assertNoJavaScriptErrors();
});
