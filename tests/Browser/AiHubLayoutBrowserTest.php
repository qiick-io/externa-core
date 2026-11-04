<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;

/**
 * The assistant page sits in the shared PageLayout gutter like the chat hub,
 * with the filled New chat button in the page header.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->admin = User::factory()->create();
    $this->admin->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($this->admin);
});

/**
 * Geometry of the shared hub chrome (search, list, list header) as JSON.
 */
function chatHubChromeScript(string $searchTest, string $hubTest): string
{
    return <<<JS
(() => {
  const rect = (element) => {
    const box = element.getBoundingClientRect();

    return [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)];
  };

  return JSON.stringify({
    search: rect(document.querySelector('[data-test="{$searchTest}"]')),
    list: rect(document.querySelector('[data-test="{$hubTest}"] aside')),
    listHeader: rect(document.querySelector('[data-test="chat-hub-list-header"]')),
  });
})()
JS;
}

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
  const list = document.querySelector('[data-test="chat-hub-list-header"]').getBoundingClientRect();
  const pane = document.querySelector('[data-test="ai-pane-header"]').getBoundingClientRect();

  return list.top === pane.top && list.height === pane.height;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('lays out /ai and /chat with the same search, list and list header geometry', function (): void {
    $chat = visit('/chat')->script(chatHubChromeScript('chat-filter-q', 'chat-hub'));
    $assistant = visit('/ai')->script(chatHubChromeScript('ai-filter-q', 'ai-hub'));

    expect($assistant)->toBe($chat);
});

it('filters the assistant conversation list from the search field', function (): void {
    foreach (['Quarterly report', 'Holiday plan'] as $title) {
        Conversation::query()->create([
            'id' => (string) Str::uuid7(),
            'participant_type' => $this->admin->getMorphClass(),
            'participant_id' => $this->admin->id,
            'title' => $title,
        ]);
    }

    $page = visit('/ai');

    $page->assertSeeIn('[data-test="ai-list"]', 'Holiday plan')
        ->fill('[data-test="ai-filter-q"]', 'report')
        ->wait(1)
        ->assertSeeIn('[data-test="ai-list"]', 'Quarterly report')
        ->assertDontSeeIn('[data-test="ai-list"]', 'Holiday plan')
        ->assertNoJavaScriptErrors();
});
