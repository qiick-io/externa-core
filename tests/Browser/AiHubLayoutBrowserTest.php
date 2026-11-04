<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The assistant page sits in the shared PageLayout gutter like the chat hub,
 * with the filled New chat button in the page header.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('insets the assistant by the same 16px gutter as the other pages', function (): void {
    $page = visit('/ai');

    $page->assertPresent('[data-test="ai-hub"]')
        ->assertScript(<<<'JS'
(() => {
  const main = document.querySelector('#main-content').getBoundingClientRect();
  const hub = document.querySelector('[data-test="ai-hub"]').getBoundingClientRect();

  // Measure from the inside of the panel frame (1px border).
  const frame = parseFloat(getComputedStyle(document.querySelector('#main-content')).borderLeftWidth) || 0;

  return Math.round(hub.left - main.left - frame) === 16 && Math.round(main.right - hub.right - frame) === 16;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('puts a single filled New chat button in the page header', function (): void {
    $page = visit('/ai');

    $page->assertPresent('header [data-test="ai-new-chat"]')
        ->assertScript("document.querySelector('[data-test=\"ai-new-chat\"]').classList.contains('bg-primary')")
        ->assertScript("[...document.querySelectorAll('a, button')].filter((element) => element.textContent.trim() === 'New chat').length === 1")
        ->assertNoJavaScriptErrors();
});

it('aligns the conversation list header with the chat pane header', function (): void {
    $page = visit('/ai');

    $page->assertScript(<<<'JS'
(() => {
  const list = document.querySelector('[data-test="ai-list-header"]').getBoundingClientRect();
  const pane = document.querySelector('[data-test="ai-pane-header"]').getBoundingClientRect();

  return list.top === pane.top && list.height === pane.height;
})()
JS)
        ->assertNoJavaScriptErrors();
});
