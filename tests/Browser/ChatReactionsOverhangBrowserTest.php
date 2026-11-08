<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * BubbleReactions overhang the bubble's bottom edge by design. The scroller
 * reserves room for it: the last message's reactions stay fully visible at the
 * bottom (outside the viewport's bottom fade), and reactions in the middle
 * don't reach the next row.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Viewer']);
    $this->bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Sender']);
    $this->carla = User::factory()->create(['first_name' => 'Carla', 'last_name' => 'Peer']);

    foreach ([$this->alice, $this->bruno, $this->carla] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $this->chatId = $this->actingAs($this->alice)
        ->postJson('/chat/threads', ['kind' => 'direct', 'user_ids' => [$this->bruno->id, $this->carla->id]])
        ->assertSuccessful()
        ->json('chat.id');
});

/** Post a message as `$author` and react to it with 👍 as `$reactor`. */
function postWithReaction(string $chatId, User $author, string $body, ?User $reactor): void
{
    $id = test()->actingAs($author)
        ->postJson("/chat/{$chatId}/messages", ['body' => $body])
        ->assertSuccessful()
        ->json('message.id');

    if ($reactor) {
        test()->actingAs($reactor)
            ->postJson("/chat/{$chatId}/messages/{$id}/reactions", ['emoji' => '👍'])
            ->assertSuccessful();
    }
}

/** The last message's reactions pill sits inside the scroller's visible, unfaded rect. */
const LAST_REACTIONS_VISIBLE = <<<'JS'
(() => {
  const viewport = document.querySelector('[data-slot="message-scroller-viewport"]');
  const pills = [...viewport.querySelectorAll('[data-test="chat-message-reactions"]')];
  const pill = pills.at(-1).getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 2;

  // scroll-fade-b masks the bottom of the viewport; keep the pill above it.
  const fade = parseFloat(getComputedStyle(viewport).getPropertyValue('--scroll-fade-size')) || 0;

  return atBottom && pill.top >= view.top && pill.bottom <= view.bottom - fade;
})()
JS;

/**
 * Every reactions pill, ring included, stays inside its scroller item (items
 * use content-visibility:auto, which clips paint to the item box), so it is
 * never cut and never reaches the next row.
 */
const REACTIONS_INSIDE_THEIR_ROW = <<<'JS'
(() => {
  const pills = [...document.querySelectorAll('[data-slot="message-scroller-viewport"] [data-test="chat-message-reactions"]')];

  return pills.length > 0 && pills.every((pill) => {
    const ring = 3;
    const item = pill.closest('[data-slot="message-scroller-item"]').getBoundingClientRect();
    const box = pill.getBoundingClientRect();
    const next = pill.closest('[data-slot="message-scroller-item"]').nextElementSibling;

    return box.bottom + ring <= item.bottom && (!next || box.bottom + ring <= next.getBoundingClientRect().top);
  });
})()
JS;

it('keeps the last own message reactions visible on /chat', function (): void {
    foreach (range(1, 20) as $n) {
        postWithReaction($this->chatId, $n % 2 ? $this->bruno : $this->carla, "Filler {$n}", null);
    }

    postWithReaction($this->chatId, $this->bruno, 'First from Bruno', $this->alice);
    postWithReaction($this->chatId, $this->carla, 'Then Carla', null);
    postWithReaction($this->chatId, $this->alice, 'Last from Alice', $this->bruno);

    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Last from Alice')
        ->wait(0.5)
        ->assertScript(LAST_REACTIONS_VISIBLE)
        ->assertScript(REACTIONS_INSIDE_THEIR_ROW)
        ->assertNoJavaScriptErrors();
});

it('keeps the last message reactions from someone else visible on /chat', function (): void {
    postWithReaction($this->chatId, $this->alice, 'Alice asks', $this->bruno);
    postWithReaction($this->chatId, $this->bruno, 'Bruno answers last', $this->alice);

    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Bruno answers last')
        ->wait(0.5)
        ->assertScript(LAST_REACTIONS_VISIBLE)
        ->assertScript(REACTIONS_INSIDE_THEIR_ROW)
        ->assertNoJavaScriptErrors();
});
