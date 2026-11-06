<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The chat hub sits in the shared PageLayout gutter like every other page: the
 * search (as wide as the thread list) and the outline ToggleGroup live in the
 * page header filter row, above the two-pane panel.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create();
    $admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($admin);
});

it('insets the chat hub by the same 16px gutter as the other pages', function (): void {
    $page = visit('/chat');

    $page->assertPresent('[data-test="chat-hub"]')
        ->assertScript(<<<'JS'
(() => {
  const main = document.querySelector('#main-content').getBoundingClientRect();
  const hub = document.querySelector('[data-test="chat-hub"]').getBoundingClientRect();

  // Measure from the inside of the panel frame (1px border).
  const frame = parseFloat(getComputedStyle(document.querySelector('#main-content')).borderLeftWidth) || 0;

  return Math.round(hub.left - main.left - frame) === 16 && Math.round(main.right - hub.right - frame) === 16;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('switches between collection and user chats with the shared toggle group', function (): void {
    $page = visit('/chat');

    $page->assertAttribute('[data-test="chat-tab-collection"]', 'data-state', 'on')
        ->assertScript("document.querySelector('[data-test=\"chat-tab-collection\"]').getBoundingClientRect().height === 32")
        ->assertPresent('[data-test="chat-list-empty"]')
        ->assertPresent('[data-test="chat-pane-empty"]')
        ->assertScript("document.querySelector('[data-test=\"chat-filter-archived\"]').disabled === true")
        ->click('[data-test="chat-tab-private"]')
        ->assertAttribute('[data-test="chat-tab-private"]', 'data-state', 'on')
        ->assertAttribute('[data-test="chat-tab-collection"]', 'data-state', 'off')
        ->assertScript("document.querySelector('[data-test=\"chat-filter-archived\"]').disabled === false")
        ->assertNoJavaScriptErrors();
});

it('puts the chat search above the thread list, as wide as the list', function (): void {
    $page = visit('/chat');

    $page->assertPresent('[data-slot="page-header"] [data-test="chat-filter-q"]')
        ->assertPresent('[data-slot="page-header"] [data-test="chat-tab-collection"]')
        ->assertScript(<<<'JS'
(() => {
  // The search is an InputGroup: its bordered box is the group around the input.
  const search = document.querySelector('[data-test="chat-filter-q"]').closest('[data-slot="input-group"]').getBoundingClientRect();
  const list = document.querySelector('[data-test="chat-hub"] aside').getBoundingClientRect();

  return Math.round(search.left) === Math.round(list.left) && Math.round(search.width) === Math.round(list.width);
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('uses a filled New chat button and centres the empty thread list', function (): void {
    $page = visit('/chat');

    $page->assertScript("document.querySelector('[data-test=\"chat-new\"]').classList.contains('bg-primary')")
        ->assertScript(<<<'JS'
(() => {
  const list = document.querySelector('[data-test="chat-list"]').getBoundingClientRect();
  const empty = document.querySelector('[data-test="chat-list-empty"]').getBoundingClientRect();

  return Math.abs((empty.top + empty.height / 2) - (list.top + list.height / 2)) <= 2;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('shows the disabled composer under the empty pane when no thread is selected', function (): void {
    $page = visit('/chat');

    $page->assertPresent('[data-test="chat-pane-empty"]')
        ->assertPresent('[data-test="chat-composer-placeholder"] textarea[disabled]')
        ->assertNoJavaScriptErrors();
});
