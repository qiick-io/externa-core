<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * One focus standard: fields colour their border with `--ring` plus a soft halo
 * (no offset ring, so nothing doubles or gets clipped), an open Select keeps the
 * ring border, and `#main-content` takes programmatic focus without an outline.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('shows no outline on the main content focus target', function (): void {
    $page = visit('/activity-logs');

    $page->assertScript(<<<'JS'
(() => {
  const main = document.getElementById('main-content');
  main.focus();

  return document.activeElement === main && getComputedStyle(main).outlineStyle === 'none';
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('focuses a filter field with a ring border and an unclipped halo, no offset ring', function (): void {
    $page = visit('/activity-logs');

    $page->assertScript(<<<'JS'
(async () => {
  const input = document.querySelector('[data-testid="activity-log-filters"] input');
  input.focus();
  await new Promise((resolve) => setTimeout(resolve, 200));

  // A search field is an InputGroup: the border and the halo sit on the group box.
  const field = input.closest('[data-slot="input-group"]') ?? input;
  const style = getComputedStyle(field);
  const probe = document.createElement('div');
  probe.style.color = 'var(--ring)';
  document.body.append(probe);
  const ring = getComputedStyle(probe).color;
  probe.remove();

  const visibleShadows = style.boxShadow.split(/,(?![^(]*\))/).filter((shadow) => !shadow.includes('rgba(0, 0, 0, 0)'));
  const halo = visibleShadows.find((shadow) => shadow.trim().endsWith('0px 0px 0px 3px'));

  const row = input.closest('[data-slot="page-header-filters"]').getBoundingClientRect();
  const box = field.getBoundingClientRect();
  const fitsRow = box.left - 3 >= row.left && box.top - 3 >= row.top && box.bottom + 3 <= row.bottom;

  return style.borderTopColor === ring && halo !== undefined && !style.boxShadow.includes('0px 0px 0px 4px') && fitsRow;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('keeps the ring border on a Select trigger while its menu is open', function (): void {
    $page = visit('/users');

    $page->click('button[aria-label="Sort by"]')
        ->wait(0.3)
        ->assertScript(<<<'JS'
(() => {
  const trigger = document.querySelector('button[aria-label="Sort by"][data-state="open"]');
  const probe = document.createElement('div');
  probe.style.color = 'var(--ring)';
  document.body.append(probe);
  const ring = getComputedStyle(probe).color;
  probe.remove();

  return trigger !== null && getComputedStyle(trigger).borderTopColor === ring;
})()
JS)
        ->assertNoJavaScriptErrors();
});
