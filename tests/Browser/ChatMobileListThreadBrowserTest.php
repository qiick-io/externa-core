<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;

/**
 * On a phone the chat hub and the assistant show either the list or the open
 * thread, full width, with a back button in the thread header; the header row
 * of search and filters fits without overlapping. Desktop keeps both columns.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Mobile']);
    $this->bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Mobile']);

    foreach ([$this->alice, $this->bruno] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $this->actingAs($this->alice);
});

/**
 * Which hub column is shown: `list` or `thread` when exactly one is displayed
 * and it fills the hub's width, otherwise a description of what is on screen.
 */
function mobileHubShownColumnScript(string $listTest, string $threadTest): string
{
    return <<<JS
(() => {
  const shown = (selector) => {
    const element = document.querySelector(selector);

    return element && getComputedStyle(element).display !== 'none' ? element : null;
  };
  const list = shown('[data-test="{$listTest}"]');
  const thread = shown('[data-test="{$threadTest}"]');
  const hub = document.querySelector('[data-test="{$listTest}"]').parentElement.getBoundingClientRect();
  const fills = (element) => Math.abs(element.getBoundingClientRect().width - hub.width) < 1;

  if (list && !thread && fills(list)) {
    return 'list';
  }

  if (thread && !list && fills(thread)) {
    return 'thread';
  }

  return JSON.stringify({ hub: hub.width, list: list?.getBoundingClientRect().width ?? null, thread: thread?.getBoundingClientRect().width ?? null });
})()
JS;
}

/**
 * Pairs of visible page-header controls whose boxes overlap, plus a note when
 * the filter row overflows its width.
 */
const MOBILE_HUB_HEADER_OVERLAPS = <<<'JS'
(() => {
  const header = document.querySelector('[data-slot="page-header"]');
  const controls = [...header.querySelectorAll('input, button')]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({ element, box: (element.closest('[data-slot="input-group"]') ?? element).getBoundingClientRect() }));
  const overlaps = [];

  controls.forEach((first, index) => {
    controls.slice(index + 1).forEach((second) => {
      if (first.box === second.box || first.element.closest('[data-slot="input-group"]') && first.element.closest('[data-slot="input-group"]') === second.element.closest('[data-slot="input-group"]')) {
        return;
      }

      const apart = first.box.right <= second.box.left + 0.5 || second.box.right <= first.box.left + 0.5
        || first.box.bottom <= second.box.top + 0.5 || second.box.bottom <= first.box.top + 0.5;

      if (!apart) {
        overlaps.push(`${first.element.outerHTML.slice(0, 60)} × ${second.element.outerHTML.slice(0, 60)}`);
      }
    });
  });

  const row = header.lastElementChild;

  if (row.scrollWidth > row.clientWidth + 1) {
    overlaps.push('filter row overflows');
  }

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    overlaps.push('page overflows horizontally');
  }

  return overlaps;
})()
JS;

it('switches the chat hub between the list and a full-width thread on a phone', function (): void {
    $chatId = $this->postJson('/chat/threads', ['kind' => 'direct', 'user_ids' => [$this->bruno->id]])
        ->assertSuccessful()
        ->json('chat.id');

    $this->postJson("/chat/{$chatId}/messages", ['body' => 'Hello from the phone'])->assertSuccessful();

    $page = visit('/chat?tab=private');

    $page->resize(390, 844)
        ->assertVisible('[data-test="chat-thread-row"]')
        ->assertScript(mobileHubShownColumnScript('chat-list-column', 'chat-thread-column'), 'list')
        ->assertNoJavaScriptErrors();

    expect($page->script(MOBILE_HUB_HEADER_OVERLAPS))->toBe([]);

    $page->click('[data-test="chat-thread-row"]')
        ->assertSee('Hello from the phone')
        ->assertVisible('[data-test="chat-thread-back"]')
        ->assertScript(mobileHubShownColumnScript('chat-list-column', 'chat-thread-column'), 'thread')
        ->assertPathIs("/chat/{$chatId}");

    $page->click('[data-test="chat-thread-back"]')
        ->assertVisible('[data-test="chat-thread-row"]')
        ->assertScript(mobileHubShownColumnScript('chat-list-column', 'chat-thread-column'), 'list')
        ->assertPathIs('/chat')
        ->assertNoJavaScriptErrors();
});

it('switches the assistant between the list and a full-width conversation on a phone', function (): void {
    Conversation::query()->create([
        'id' => (string) Str::uuid7(),
        'participant_type' => $this->alice->getMorphClass(),
        'participant_id' => $this->alice->id,
        'title' => 'Phone conversation',
    ]);

    $page = visit('/ai');

    $page->resize(390, 844)
        ->assertSee('Phone conversation')
        ->assertScript(mobileHubShownColumnScript('ai-list-column', 'ai-thread-column'), 'list')
        ->assertNoJavaScriptErrors();

    expect($page->script(MOBILE_HUB_HEADER_OVERLAPS))->toBe([]);

    $page->click('Phone conversation')
        ->assertVisible('[data-test="ai-thread-back"]')
        ->assertSeeIn('[data-test="ai-thread-header"]', 'Phone conversation')
        ->assertScript(mobileHubShownColumnScript('ai-list-column', 'ai-thread-column'), 'thread');

    $page->click('[data-test="ai-thread-back"]')
        ->assertSee('Phone conversation')
        ->assertScript(mobileHubShownColumnScript('ai-list-column', 'ai-thread-column'), 'list')
        ->assertPathIs('/ai')
        ->assertNoJavaScriptErrors();
});

it('keeps the list and the thread side by side on desktop without a back button', function (): void {
    $chatId = $this->postJson('/chat/threads', ['kind' => 'direct', 'user_ids' => [$this->bruno->id]])
        ->assertSuccessful()
        ->json('chat.id');

    $this->postJson("/chat/{$chatId}/messages", ['body' => 'Hello from the desk'])->assertSuccessful();

    $page = visit("/chat/{$chatId}");

    $page->resize(1280, 800)
        ->assertSee('Hello from the desk')
        ->assertScript(<<<'JS'
(() => {
  const list = document.querySelector('[data-test="chat-list-column"]').getBoundingClientRect();
  const thread = document.querySelector('[data-test="chat-thread-column"]').getBoundingClientRect();
  const back = document.querySelector('[data-test="chat-thread-back"]');

  return list.width === 320 && thread.left >= list.right && thread.width > 600 && back !== null && getComputedStyle(back).display === 'none';
})()
JS)
        ->assertNoJavaScriptErrors();
});
