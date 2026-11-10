<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Author names and mentions in a chat open a user hover card (shadcn
 * HoverCard): avatar, name, role and presence. Mentions are Badges.
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

    $this->actingAs($this->bruno)
        ->postJson("/chat/{$this->chatId}/messages", [
            'body' => "Ask @[user:{$this->carla->id}] please",
            'mentioned_user_ids' => [$this->carla->id],
        ])
        ->assertSuccessful();

    $this->actingAs($this->alice);
});

it('opens the user card from an author name with name, role and presence', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('please')
        ->hover('[data-test="chat-author-name"]')
        ->assertPresent('[data-test="chat-user-hover-card"]')
        ->assertSeeIn('[data-test="chat-user-hover-card"]', 'Bruno Sender')
        ->assertSeeIn('[data-test="chat-user-hover-card"]', RoleEnum::SuperAdmin->value)
        ->assertSeeIn('[data-test="chat-user-presence"]', 'Offline')
        ->assertNoJavaScriptErrors();
});

it('renders mentions as badges that open the mentioned user card', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('please')
        // Badge rendered asChild as the HoverCard trigger button.
        ->assertScript("(() => { const m = document.querySelector('[data-test=\"chat-mention\"]'); return m.tagName === 'BUTTON' && m.dataset.slot === 'hover-card-trigger' && m.classList.contains('bg-primary/15') && m.classList.contains('whitespace-nowrap'); })()")
        ->assertSeeIn('[data-test="chat-mention"]', '@Carla Peer')
        ->hover('[data-test="chat-mention"]')
        ->assertSeeIn('[data-test="chat-user-hover-card"]', 'Carla Peer')
        ->assertNoJavaScriptErrors();
});
