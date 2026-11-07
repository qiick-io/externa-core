<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * The chat thread's pieces sit on shadcn primitives: pinned messages and reply
 * quotes on Item, reactions as Button xs with their count and a Tooltip of
 * who reacted, and the composer's emoji picker as a grid of icon-sm Buttons.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Viewer']);
    $this->bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Sender']);

    foreach ([$this->alice, $this->bruno] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $chatId = $this->actingAs($this->alice)
        ->postJson('/chat/threads', ['kind' => 'direct', 'user_ids' => [$this->bruno->id]])
        ->assertSuccessful()
        ->json('chat.id');

    $originalId = $this->actingAs($this->bruno)
        ->postJson("/chat/{$chatId}/messages", ['body' => 'Original note'])
        ->assertSuccessful()
        ->json('message.id');

    $this->actingAs($this->alice)
        ->postJson("/chat/{$chatId}/messages", ['body' => 'Reply note', 'reply_to_id' => $originalId])
        ->assertSuccessful();

    $this->putJson("/chat/{$chatId}/messages/{$originalId}/pin", ['pinned' => true])->assertSuccessful();

    foreach ([$this->alice, $this->bruno] as $user) {
        $this->actingAs($user)
            ->postJson("/chat/{$chatId}/messages/{$originalId}/reactions", ['emoji' => '👍'])
            ->assertSuccessful();
    }

    $this->chatId = $chatId;
    $this->actingAs($this->alice);
});

it('renders pinned messages and reply quotes as items', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Reply note')
        ->assertScript(<<<'JS'
(() => {
  const pinned = document.querySelector('[data-test="chat-pinned-bar"] [data-slot="item"]');

  return pinned?.tagName === 'BUTTON' && pinned.textContent.includes('Bruno Sender') && pinned.textContent.includes('Original note');
})()
JS)
        ->assertScript(<<<'JS'
(() => {
  const quote = document.querySelector('[data-slot="message"] [data-test="chat-reply-quote"]');

  return quote?.dataset.slot === 'item' && quote.textContent.includes('Original note');
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('shows reactions as buttons with their count, pressed for the viewer', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Reply note')
        ->assertScript(<<<'JS'
(() => {
  const reaction = document.querySelector('[data-test="chat-message-reactions"] button');

  return reaction?.textContent === '👍2' && reaction.getAttribute('aria-pressed') === 'true'
    && reaction.getAttribute('aria-label').includes('Alice Viewer') && reaction.getAttribute('aria-label').includes('Bruno Sender')
    && reaction.querySelectorAll('[data-slot="avatar"]').length === 0;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('lays the composer emoji picker out as icon buttons', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Reply note')
        ->click('[aria-label="Emoji"]')
        ->assertPresent('[data-test="chat-emoji-grid"]')
        ->assertScript(<<<'JS'
(() => {
  const buttons = [...document.querySelectorAll('[data-test="chat-emoji-grid"] button')];

  return buttons.length > 8 && buttons.every((button) => Math.round(button.getBoundingClientRect().height) === 24);
})()
JS)
        ->assertNoJavaScriptErrors();
});
