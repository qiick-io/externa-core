<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The chat hub sits in the shared PageLayout gutter like every other page and
 * switches lists with the shared outline ToggleGroup.
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

  return Math.round(hub.left - main.left) === 16 && Math.round(main.right - hub.right) === 16;
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
        ->click('[data-test="chat-tab-private"]')
        ->assertAttribute('[data-test="chat-tab-private"]', 'data-state', 'on')
        ->assertAttribute('[data-test="chat-tab-collection"]', 'data-state', 'off')
        ->assertPresent('[data-test="chat-filter-archived"]')
        ->assertNoJavaScriptErrors();
});
