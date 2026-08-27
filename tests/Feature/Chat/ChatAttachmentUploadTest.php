<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('local');
    Storage::fake('assets');
});

/**
 * @return array{user: User, collection: Collection, item: \App\Models\CollectionItem}
 */
function chatUploadKitchen(): array
{
    $user = grantCollectionPermissions(User::factory()->create(), allCollectionPermissions());
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'collection', 'item');
}

test('chat chunked upload init chunk complete creates orphan attachment', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatUploadKitchen();
    $this->actingAs($user);

    $content = str_repeat('v', 12 * 1024);
    $totalChunks = 2;
    $chunkSize = (int) ceil(strlen($content) / $totalChunks);

    $init = $this->postJson(route('collections.items.chat.attachments.uploads.init', [$collection, $item]), [
        'file_name' => 'clip.mp4',
        'total_size' => strlen($content),
        'total_chunks' => $totalChunks,
        'mime_type' => 'video/mp4',
    ])->assertCreated();

    $uploadId = $init->json('upload_id');

    for ($index = 0; $index < $totalChunks; $index++) {
        $piece = substr($content, $index * $chunkSize, $chunkSize);
        $this->post(route('collections.items.chat.attachments.uploads.chunk', [$collection, $item]), [
            'upload_id' => $uploadId,
            'chunk_index' => $index,
            'chunk' => UploadedFile::fake()->createWithContent("part-{$index}.bin", $piece),
        ])->assertNoContent();
    }

    $complete = $this->postJson(route('collections.items.chat.attachments.uploads.complete', [$collection, $item]), [
        'upload_id' => $uploadId,
    ])->assertCreated()->json('attachment');

    expect($complete['name'])->toBe('clip.mp4')
        ->and($complete['mime'])->toBe('video/mp4')
        ->and($complete['size'])->toBe(strlen($content))
        ->and(CollectionItemChatAttachment::query()->where('id', $complete['id'])->whereNull('message_id')->exists())->toBeTrue();
});

test('chat upload respects chat_max_upload_bytes setting', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatUploadKitchen();
    $this->actingAs($user);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'chat_max_upload_bytes',
        1024,
    );

    expect(app(ProjectSettings::class)->chatMaxUploadBytes())->toBe(1024);

    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => UploadedFile::fake()->createWithContent('big.txt', str_repeat('x', 2048)),
    ])->assertUnprocessable();

    $this->postJson(route('collections.items.chat.attachments.uploads.init', [$collection, $item]), [
        'file_name' => 'big.txt',
        'total_size' => 2048,
        'total_chunks' => 1,
        'mime_type' => 'text/plain',
    ])->assertUnprocessable();

    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => UploadedFile::fake()->createWithContent('ok.txt', 'hi'),
    ])->assertCreated();
});

test('chat image upload generates preview endpoint', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatUploadKitchen();
    $this->actingAs($user);

    $upload = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->image('shot.png', 80, 60)],
    )->assertCreated()->json('attachment');

    expect($upload['has_preview'])->toBeTrue();

    $attachment = CollectionItemChatAttachment::query()->findOrFail($upload['id']);
    expect($attachment->hasPreview())->toBeTrue();

    $this->get(route('collections.items.chat.attachments.preview', [
        $collection,
        $item,
        $upload['id'],
    ]))->assertOk();

    $this->get(route('collections.items.chat.attachments.show', [
        $collection,
        $item,
        $upload['id'],
    ]))->assertOk();
});

test('orphan chat attachment can be deleted by owner', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = chatUploadKitchen();
    $this->actingAs($user);

    $upload = $this->postJson(
        route('collections.items.chat.attachments.store', [$collection, $item]),
        ['file' => UploadedFile::fake()->createWithContent('tmp.txt', 'x')],
    )->assertCreated()->json('attachment');

    $this->deleteJson(route('collections.items.chat.attachments.destroy', [
        $collection,
        $item,
        $upload['id'],
    ]))->assertNoContent();

    expect(CollectionItemChatAttachment::query()->where('id', $upload['id'])->exists())->toBeFalse();
});

test('files upload init respects files_max_upload_bytes', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'files_max_upload_bytes',
        500,
    );

    $this->postJson(route('files.uploads.init'), [
        'file_name' => 'too-big.bin',
        'total_size' => 2048,
        'total_chunks' => 1,
        'mime_type' => 'application/octet-stream',
    ])->assertUnprocessable();
});
