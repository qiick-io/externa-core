<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * In a group chat, consecutive messages from one sender form a MessageGroup:
 * the sender's name (MessageHeader) and avatar show once, on the first
 * message; own messages sit at the end. Names keep the normal foreground, and
 * every message has a visible, keyboard-reachable actions menu.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Viewer']);
    $this->bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Sender']);
    $this->carla = User::factory()->create(['first_name' => 'Carla', 'last_name' => 'Sender']);

    foreach ([$this->alice, $this->bruno, $this->carla] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $this->chatId = $this->actingAs($this->alice)
        ->postJson('/chat/threads', [
            'kind' => 'direct',
            'user_ids' => [$this->bruno->id, $this->carla->id],
        ])
        ->assertSuccessful()
        ->json('chat.id');

    foreach ([
        [$this->bruno, 'Bruno one'],
        [$this->bruno, 'Bruno two'],
        [$this->carla, 'Carla one'],
        [$this->bruno, 'Bruno three'],
        [$this->alice, 'Alice one'],
        [$this->alice, 'Alice two'],
    ] as [$author, $body]) {
        $this->actingAs($author)
            ->postJson("/chat/{$this->chatId}/messages", ['body' => $body])
            ->assertSuccessful();
    }

    $this->actingAs($this->alice);
});

it('groups consecutive messages by sender with one name header per group', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Alice two')
        ->assertScript("document.querySelectorAll('[data-test=\"chat-message-group\"]').length === 4")
        ->assertScript(<<<'JS'
(() => {
  const headers = [...document.querySelectorAll('[data-test="chat-message-group"] [data-slot="message-header"]')]
    .map((header) => header.textContent.trim());

  return JSON.stringify(headers) === JSON.stringify(['Bruno Sender', 'Carla Sender', 'Bruno Sender']);
})()
JS)
        ->assertScript(<<<'JS'
(() => {
  const groups = [...document.querySelectorAll('[data-test="chat-message-group"]')];
  const own = groups.at(-1).querySelectorAll('[data-slot="message"]');

  return own.length === 2 && [...own].every((message) => message.dataset.align === 'end');
})()
JS)
        ->assertScript("document.querySelectorAll('[data-test=\"chat-message-group\"] [data-slot=\"avatar\"]').length === 3")
        ->assertNoJavaScriptErrors();
});

it('keeps sender names in the normal foreground, not an avatar colour', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Alice two')
        ->assertScript(<<<'JS'
(() => {
  const header = document.querySelector('[data-test="chat-message-group"] [data-slot="message-header"]');

  return header.classList.contains('text-foreground') && !header.getAttribute('style');
})()
JS)
        ->assertScript("[...document.querySelectorAll('[data-test=\"chat-message-group\"] [style*=\"color\"]')].length === 0")
        ->assertNoJavaScriptErrors();
});

it('gives every message a visible actions menu', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Alice two')
        ->assertScript("document.querySelectorAll('[data-test=\"chat-message-menu\"]').length === 6")
        ->assertNoJavaScriptErrors();
});
