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

it('opens the rows-per-page options upward when the select sits at the bottom of the window', function (): void {
    foreach (range(1, 30) as $index) {
        User::factory()->create(['email' => "edge-{$index}@example.com"]);
    }

    $page = visit('/users');

    $page->script("document.querySelector('[data-test=\"rows-per-page\"]').scrollIntoView({ block: 'end' })");

    $page->click('[data-test="rows-per-page"]')
        ->wait(0.3)
        ->assertAttribute('[data-slot="select-content"]', 'data-side', 'top')
        ->assertScript("[...document.querySelectorAll('[role=\"option\"]')].every((option) => { const rect = option.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= window.innerHeight; })")
        ->assertNoJavaScriptErrors();
});

it('keeps the table header pinned to the top of the panel while 50 rows scroll', function (): void {
    foreach (range(1, 60) as $index) {
        User::factory()->create(['email' => "sticky-{$index}@example.com"]);
    }

    $page = visit('/users?per_page=50');

    $page->script("document.querySelector('[data-slot=\"table-panel-scroll\"]').scrollTop = 600");

    $page->wait(0.2)
        ->assertScript(<<<'JS'
(() => {
  const panel = document.querySelector('[data-slot="table-panel-scroll"]');
  const header = panel.querySelector('thead').getBoundingClientRect();

  return panel.scrollTop > 0 && Math.round(header.top) === Math.round(panel.getBoundingClientRect().top);
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('shows the row range on the left, the page links centred and rows per page on the right', function (): void {
    foreach (range(1, 60) as $index) {
        User::factory()->create(['email' => "range-{$index}@example.com"]);
    }

    $page = visit('/users');

    $page->assertSeeIn('[data-test="pagination-range"]', '1–20 of 61')
        ->assertScript(<<<'JS'
(() => {
  const range = document.querySelector('[data-test="pagination-range"]').getBoundingClientRect();
  const perPage = document.querySelector('[data-test="rows-per-page"]').getBoundingClientRect();
  const pages = document.querySelector('[data-slot="pagination"]').getBoundingClientRect();
  const footer = document.querySelector('[data-test="pagination-range"]').parentElement;
  const panel = footer.getBoundingClientRect();
  const contentRight = panel.right - parseFloat(getComputedStyle(footer).paddingRight);
  const pagesCentre = (pages.left + pages.right) / 2;
  const contentCentre = (panel.left + contentRight) / 2;

  return range.left - panel.left < 4
    && Math.abs(pagesCentre - contentCentre) < 4
    && contentRight - perPage.right < 4
    && pages.right < perPage.left;
})()
JS)
        ->assertNoJavaScriptErrors();

    visit('/users?page=2')
        ->assertSeeIn('[data-test="pagination-range"]', '21–40 of 61');
});
