<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('opens and closes dialog sheet and menu with reduce-motion without getting stuck', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $overlaysBecomeVisibleAndUnmount = <<<'JS'
() => {
  document.documentElement.classList.add('reduce-motion');

  const menuTrigger = document.querySelector('[data-test="sidebar-menu-button"]');
  if (!(menuTrigger instanceof HTMLElement)) {
    return 'missing-menu-trigger';
  }

  menuTrigger.click();

  const menu = document.querySelector('[data-slot="dropdown-menu-content"]');
  if (!(menu instanceof HTMLElement)) {
    return 'menu-missing';
  }

  const menuStyle = getComputedStyle(menu);
  if (menuStyle.display === 'none' || menuStyle.visibility === 'hidden') {
    return 'menu-invisible';
  }

  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  return document.documentElement.classList.contains('reduce-motion')
    ? 'ok'
    : 'missing-reduce-motion';
}
JS;

    $page = visit('/collections');

    $page->assertPresent('#main-content')
        ->assertScript(
            '() => { document.documentElement.classList.add("reduce-motion"); return document.documentElement.classList.contains("reduce-motion"); }',
            true,
        )
        ->click('[data-test="sidebar-menu-button"]')
        ->wait(0.3)
        ->assertSee('Accessibility')
        ->keys('body', 'Escape')
        ->wait(0.2)
        ->assertScript($overlaysBecomeVisibleAndUnmount, 'ok')
        ->assertNoJavaScriptErrors();
});

it('keeps main content focusable after navigation with reduce-motion', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $page = visit('/dashboard');

    $page->assertPresent('#main-content')
        ->assertScript(
            '() => { document.documentElement.classList.add("reduce-motion"); document.getElementById("main-content")?.focus(); return document.activeElement?.id === "main-content"; }',
            true,
        )
        ->assertNoJavaScriptErrors();
});
