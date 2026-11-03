<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Shared "Rows per page" select (10 / 20 / 50 / 100) under admin lists: the size
 * lives in the URL as `per_page`, resets to page 1 and survives filter changes.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create(['email' => 'rows-admin@example.com']);
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('shows 50 users after choosing 50 rows per page and keeps it across a search', function (): void {
    foreach (range(1, 60) as $index) {
        User::factory()->create(['email' => "rows-{$index}@example.com"]);
    }

    $page = visit('/users');

    $page->assertScript("document.querySelectorAll('tbody tr').length === 20")
        ->assertSeeIn('[data-test="rows-per-page"]', '20')
        ->click('[data-test="rows-per-page"]')
        ->click('[role="option"]:has-text("50")')
        ->wait(0.5)
        ->assertQueryStringHas('per_page', '50')
        ->assertScript("document.querySelectorAll('tbody tr').length === 50")
        ->assertSeeIn('[data-test="rows-per-page"]', '50')
        ->fill('input[aria-label="Search users…"]', 'rows-')
        ->wait(1)
        ->assertQueryStringHas('search', 'rows-')
        ->assertQueryStringHas('per_page', '50')
        ->assertScript("document.querySelectorAll('tbody tr').length === 50")
        ->assertNoJavaScriptErrors();
});

it('offers the rows-per-page select on the collections list', function (): void {
    Collection::factory()->count(12)->create();

    $page = visit('/collections');

    $page->assertScript("document.querySelectorAll('tbody tr').length === 12")
        // Default control scale (#472): the select is a 32px control.
        ->assertScript("document.querySelector('[data-test=\"rows-per-page\"]').getBoundingClientRect().height === 32")
        ->click('[data-test="rows-per-page"]')
        ->click('[role="option"]:has-text("10"):not(:has-text("100"))')
        ->wait(0.5)
        ->assertQueryStringHas('per_page', '10')
        ->assertScript("document.querySelectorAll('tbody tr').length === 10")
        ->assertPresent('nav[aria-label="pagination"]')
        ->assertNoJavaScriptErrors();
});
