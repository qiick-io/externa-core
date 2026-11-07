<?php

use App\Models\AiChatAttachment;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;

it('files:cleanup-zips removes expired archives and keeps fresh ones', function () {
    $root = storage_path('app/zips/cleanup-test');
    if (! is_dir($root)) {
        mkdir($root, 0777, true);
    }

    $expired = $root.'/expired.zip';
    $fresh = $root.'/fresh.zip';
    file_put_contents($expired, 'old');
    file_put_contents($fresh, 'new');
    touch($expired, now()->subHours(3)->getTimestamp());
    touch($fresh, now()->subMinutes(5)->getTimestamp());

    config(['files.zip_ttl_minutes' => 60]);

    $this->travel(1)->seconds();

    expect(Artisan::call('files:cleanup-zips'))->toBe(0)
        ->and(file_exists($expired))->toBeFalse()
        ->and(file_exists($fresh))->toBeTrue();

    @unlink($fresh);
    @rmdir($root);
});

it('ai:cleanup-attachments deletes expired rows and keeps fresh ones', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $expiredPath = 'ai-chat/expired.txt';
    $freshPath = 'ai-chat/fresh.txt';
    Storage::disk('local')->put($expiredPath, 'x');
    Storage::disk('local')->put($freshPath, 'y');

    $expired = AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => 'expired.txt',
        'mime_type' => 'text/plain',
        'disk' => 'local',
        'path' => $expiredPath,
        'size' => 1,
        'expires_at' => now()->subHour(),
    ]);
    $fresh = AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => 'fresh.txt',
        'mime_type' => 'text/plain',
        'disk' => 'local',
        'path' => $freshPath,
        'size' => 1,
        'expires_at' => now()->addHour(),
    ]);

    // Force fillables / required columns if schema differs
    expect(Artisan::call('ai:cleanup-attachments'))->toBe(0)
        ->and(AiChatAttachment::query()->find($expired->id))->toBeNull()
        ->and(AiChatAttachment::query()->find($fresh->id))->not->toBeNull()
        ->and(Storage::disk('local')->exists($expiredPath))->toBeFalse()
        ->and(Storage::disk('local')->exists($freshPath))->toBeTrue();
});

it('chat:cleanup-attachments deletes expired orphans and keeps fresh ones', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $expiredPath = 'chat-uploads/expired.txt';
    $freshPath = 'chat-uploads/fresh.txt';
    Storage::disk('local')->put($expiredPath, 'x');
    Storage::disk('local')->put($freshPath, 'y');

    $expired = CollectionItemChatAttachment::query()->create([
        'message_id' => null,
        'user_id' => $user->id,
        'original_name' => 'expired.txt',
        'mime_type' => 'text/plain',
        'disk' => 'local',
        'path' => $expiredPath,
        'size' => 1,
        'expires_at' => now()->subHour(),
    ]);
    $fresh = CollectionItemChatAttachment::query()->create([
        'message_id' => null,
        'user_id' => $user->id,
        'original_name' => 'fresh.txt',
        'mime_type' => 'text/plain',
        'disk' => 'local',
        'path' => $freshPath,
        'size' => 1,
        'expires_at' => now()->addHour(),
    ]);

    expect(Artisan::call('chat:cleanup-attachments'))->toBe(0)
        ->and(CollectionItemChatAttachment::query()->find($expired->id))->toBeNull()
        ->and(CollectionItemChatAttachment::query()->find($fresh->id))->not->toBeNull()
        ->and(Storage::disk('local')->exists($expiredPath))->toBeFalse()
        ->and(Storage::disk('local')->exists($freshPath))->toBeTrue();
});
