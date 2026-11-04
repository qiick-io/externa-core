<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * App shell details: user menu items share one icon-to-label gap, the inset
 * panel is framed so the header rule meets its edges, and settings switches
 * keep their intrinsic size.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('aligns every user menu label at the same distance from its icon', function (): void {
    $page = visit('/dashboard');

    $page->click('[data-test="sidebar-menu-button"]')
        ->assertPresent('[data-test="logout-button"]')
        ->assertScript(<<<'JS'
(() => {
  const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
    .filter((item) => item.querySelector('svg'));
  const gaps = items.map((item) => {
    const icon = item.querySelector('svg').getBoundingClientRect();
    const range = document.createRange();
    const text = [...item.childNodes].find((node) => node.textContent.trim() !== '' && node.nodeName !== 'svg');
    range.selectNodeContents(text);

    return Math.round(range.getBoundingClientRect().left - icon.right);
  });

  return gaps.length >= 4 && gaps.every((gap) => gap === gaps[0]);
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('frames the inset panel with a border', function (): void {
    $page = visit('/dashboard');

    $page->assertScript("getComputedStyle(document.querySelector('[data-slot=\"sidebar-inset\"]')).borderLeftWidth === '1px'")
        ->assertNoJavaScriptErrors();
});

it('keeps the deploy on publish switch at its intrinsic size', function (): void {
    $page = visit('/settings/project/integrations');

    $page->assertPresent('[data-test="deploy-on-publish"]')
        ->assertScript("document.querySelector('[data-test=\"deploy-on-publish\"]').getBoundingClientRect().width < 60")
        ->assertNoJavaScriptErrors();
});
