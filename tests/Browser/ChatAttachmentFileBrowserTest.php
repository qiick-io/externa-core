<?php

use App\Enums\RoleEnum;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Storage;

/**
 * A sent non-media file sits on shadcn Attachment: icon, name and size, the
 * whole card opening the download, and an action menu.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $this->alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Viewer']);
    $bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Sender']);

    foreach ([$this->alice, $bruno] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $this->chatId = $this->actingAs($this->alice)
        ->postJson('/chat/threads', ['kind' => 'direct', 'user_ids' => [$bruno->id]])
        ->assertSuccessful()
        ->json('chat.id');

    Storage::fake('local');

    $path = 'chat-uploads/'.$this->alice->id.'/report.pdf';
    Storage::disk('local')->put($path, str_repeat('x', 2048));

    $attachment = CollectionItemChatAttachment::query()->create([
        'message_id' => null,
        'user_id' => $this->alice->id,
        'original_name' => 'report.pdf',
        'mime_type' => 'application/pdf',
        'disk' => 'local',
        'path' => $path,
        'size' => 2048,
        'expires_at' => now()->addHour(),
    ]);

    $this->postJson("/chat/{$this->chatId}/messages", ['body' => 'Here it is', 'attachment_ids' => [$attachment->id]])
        ->assertSuccessful();
});

it('renders a sent file as an attachment card with a download trigger and actions', function (): void {
    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Here it is')
        ->assertAttribute('[data-test="chat-attachment-file"]', 'data-slot', 'attachment')
        ->assertSeeIn('[data-test="chat-attachment-file"] [data-slot="attachment-title"]', 'report.pdf')
        ->assertSeeIn('[data-test="chat-attachment-file"] [data-slot="attachment-description"]', '2.0 KB')
        ->assertScript("document.querySelector('[data-test=\"chat-attachment-file\"] a[data-slot=\"attachment-trigger\"]').getAttribute('href').includes('/attachments/')")
        ->click('[data-test="chat-attachment-file"] [data-slot="attachment-actions"] button')
        ->assertSee('Download')
        ->assertNoJavaScriptErrors();
});
