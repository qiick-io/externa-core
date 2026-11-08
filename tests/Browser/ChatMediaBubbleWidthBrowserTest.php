<?php

use App\Enums\RoleEnum;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Photos fill their chat bubble, as in WhatsApp / Telegram / iMessage: the
 * bubble takes the media's width (single photo or album), the media sits edge
 * to edge, and a long caption wraps inside that width instead of widening the
 * bubble.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('local');

    $this->alice = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Viewer']);
    $this->bruno = User::factory()->create(['first_name' => 'Bruno', 'last_name' => 'Sender']);

    foreach ([$this->alice, $this->bruno] as $user) {
        $user->assignRole(RoleEnum::SuperAdmin->value);
    }

    $this->chatId = $this->actingAs($this->alice)
        ->postJson('/chat/threads', ['kind' => 'direct', 'user_ids' => [$this->bruno->id]])
        ->assertSuccessful()
        ->json('chat.id');
});

/**
 * Send a message with `$count` photos (alternating landscape and portrait).
 */
function sendPhotos(User $author, string $chatId, int $count, string $body): void
{
    $ids = [];

    for ($index = 0; $index < $count; $index++) {
        [$width, $height] = $index % 2 === 0 ? [800, 600] : [600, 900];
        $image = UploadedFile::fake()->image("photo-{$index}.png", $width, $height);
        $path = "chat-uploads/{$author->id}/photo-{$index}-".uniqid().'.png';
        Storage::disk('local')->put($path, $image->getContent());

        $ids[] = CollectionItemChatAttachment::query()->create([
            'message_id' => null,
            'user_id' => $author->id,
            'original_name' => "photo-{$index}.png",
            'mime_type' => 'image/png',
            'disk' => 'local',
            'path' => $path,
            'size' => strlen($image->getContent()),
            'expires_at' => now()->addHour(),
        ])->id;
    }

    test()->actingAs($author)
        ->postJson("/chat/{$chatId}/messages", ['body' => $body, 'attachment_ids' => $ids])
        ->assertSuccessful();
}

/** Every media bubble: the album and each loaded single photo span the bubble's inner width. */
const MEDIA_FILLS_BUBBLE = <<<'JS'
(() => {
  const bubbles = [...document.querySelectorAll('[data-slot="bubble-content"]')]
    .filter((content) => content.querySelector('img'));

  return bubbles.length > 0 && bubbles.every((content) => {
    const inner = content.clientWidth;
    const imgs = [...content.querySelectorAll('img')];
    const album = imgs[0].closest('.w-80');
    const loaded = imgs.every((img) => img.complete && img.naturalWidth > 0);
    const single = imgs.length === 1 ? Math.round(imgs[0].getBoundingClientRect().width) === inner : true;

    return loaded && single && Math.round(album.getBoundingClientRect().width) === inner;
  });
})()
JS;

it('fills the bubble with a single photo and wraps a long caption inside it', function (): void {
    sendPhotos($this->alice, $this->chatId, 1, str_repeat('A long caption that must wrap inside the photo width. ', 3));

    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('A long caption')
        ->wait(1)
        ->assertScript(MEDIA_FILLS_BUBBLE)
        ->assertScript(<<<'JS'
(() => {
  const content = document.querySelector('[data-slot="bubble-content"]');
  const img = content.querySelector('img');
  const caption = [...content.querySelectorAll('div')].find((node) => node.textContent.startsWith('A long caption'));
  const radius = parseFloat(getComputedStyle(content).borderTopLeftRadius);

  return Math.round(img.getBoundingClientRect().top) === Math.round(content.getBoundingClientRect().top + content.clientTop)
    && caption.getBoundingClientRect().width <= content.clientWidth
    && caption.getBoundingClientRect().height > 30
    && radius > 0;
})()
JS)
        ->assertNoJavaScriptErrors();
});

it('fills the bubble with an image-only photo from the other participant', function (): void {
    sendPhotos($this->bruno, $this->chatId, 1, '');
    sendPhotos($this->bruno, $this->chatId, 1, 'Short');

    $page = visit("/chat/{$this->chatId}");

    $page->assertSee('Short')
        ->wait(1)
        ->assertScript(MEDIA_FILLS_BUBBLE)
        ->assertNoJavaScriptErrors();
});

it('fills the bubble with albums of every size', function (int $count): void {
    sendPhotos($this->alice, $this->chatId, $count, "Album of {$count}");

    $page = visit("/chat/{$this->chatId}");

    $page->assertSee("Album of {$count}")
        ->wait(1)
        ->assertScript(MEDIA_FILLS_BUBBLE)
        ->assertNoJavaScriptErrors();
})->with([2, 3, 4, 6]);
