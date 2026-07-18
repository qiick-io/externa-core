<?php

use App\Ai\Support\AiActivityLogger;
use App\Ai\Tools\ImportCollectionCsv;
use App\Ai\Tools\ImportRemoteJson;
use App\Ai\Tools\ManageAiSyncSources;
use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\RollbackLastAiTurn;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\ImportCollectionJob;
use App\Models\AiChatAttachment;
use App\Models\AiSyncSource;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('local');
    Cache::clear();
});

function phaseThreeAttachment(User $user, string $content): AiChatAttachment
{
    $path = "ai-chat-attachments/{$user->id}/large.csv";
    Storage::disk('local')->put($path, $content);

    return AiChatAttachment::query()->create([
        'user_id' => $user->id,
        'original_name' => 'large.csv',
        'mime_type' => 'text/csv',
        'disk' => 'local',
        'path' => $path,
        'size' => strlen($content),
        'expires_at' => now()->addHour(),
    ]);
}

test('large imports dispatch a job and expose owned status', function () {
    Queue::fake();
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $rows = ['sku,title'];

    for ($rowNumber = 1; $rowNumber <= 201; $rowNumber++) {
        $rows[] = "SKU-{$rowNumber},Product {$rowNumber}";
    }

    $attachment = phaseThreeAttachment($user, implode("\n", $rows));
    $result = json_decode((string) (new ImportCollectionCsv)->handle(new Request([
        'attachment_id' => $attachment->id,
        'collection_name' => 'Queued products',
    ])), true);

    expect($result['status'])->toBe('queued')
        ->and($result['job_id'])->toBeString();

    Queue::assertPushed(ImportCollectionJob::class);

    $this->getJson(route('ai.import-jobs.show', $result['job_id']))
        ->assertSuccessful()
        ->assertJson([
            'job_id' => $result['job_id'],
            'status' => 'queued',
            'total' => 201,
        ])
        ->assertJsonMissingPath('user_id');
});

test('import job reuses the spreadsheet importer and records completion', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $attachment = phaseThreeAttachment($user, "sku,title\nA1,Queued item\n");
    $job = new ImportCollectionJob(
        userId: $user->id,
        conversationId: null,
        sourceType: 'csv',
        attachmentId: $attachment->id,
        collectionName: 'Job products',
    );

    dispatch_sync($job);

    expect(ImportCollectionJob::status($job->jobId)['status'])->toBe('done')
        ->and(Collection::query()->where('name', 'Job products')->firstOrFail()->items()->count())->toBe(1);
});

test('remote import allowlist blocks a non listed host', function () {
    config()->set('ai.remote_import_hosts', ['allowed.example']);
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://blocked.example/items',
        'collection_name' => 'Blocked',
    ]));

    expect($result)->toContain('allowlist')
        ->and(Collection::query()->where('name', 'Blocked')->exists())->toBeFalse();
});

test('rollback soft deletes an item created in the latest ai turn', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanDeleteCollections->value,
    ]);
    $this->actingAs($user);

    $conversation = Conversation::query()->create([
        'id' => (string) Str::uuid(),
        'user_id' => $user->id,
        'title' => 'Rollback',
    ]);
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    AiActivityLogger::prompt($user, 'Create item', $conversation->id);
    request()->merge(['conversation_id' => $conversation->id]);
    $created = json_decode((string) (new ManageCollectionItems)->handle(new Request([
        'action' => 'create',
        'collection_id' => $collection->id,
        'data_json' => '{"title":"Temporary"}',
    ])), true);

    $result = (string) (new RollbackLastAiTurn)->handle(new Request([
        'conversation_id' => $conversation->id,
    ]));

    expect($result)->toContain('"items_soft_deleted": 1')
        ->and(CollectionItem::query()->find($created['item']['id']))->toBeNull()
        ->and(CollectionItem::query()->onlyTrashed()->find($created['item']['id']))->not->toBeNull();
});

test('sync source can be created and the command queues it', function () {
    Queue::fake();
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);
    $collection = Collection::factory()->create();

    $result = (string) (new ManageAiSyncSources)->handle(new Request([
        'action' => 'create',
        'collection_id' => $collection->id,
        'url' => 'https://93.184.216.34/products',
        'interval_minutes' => 15,
    ]));

    expect($result)->toContain('"ok": true')
        ->and(AiSyncSource::query()->where('user_id', $user->id)->exists())->toBeTrue();

    $this->artisan('ai:run-sync-sources')->assertSuccessful();

    Queue::assertPushed(ImportCollectionJob::class, fn (ImportCollectionJob $job): bool => (
        $job->userId === $user->id && $job->collectionId === $collection->id
    ));
});

test('collection import webhook rejects bad token and accepts valid token', function () {
    config()->set('ai.webhook_token', 'signed-secret');
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Webhook item'],
        ],
    ];

    $this->withToken('bad-token')
        ->postJson(route('ai.webhooks.collection-import'), $payload)
        ->assertForbidden();

    $this->withToken('signed-secret')
        ->postJson(route('ai.webhooks.collection-import'), $payload)
        ->assertSuccessful()
        ->assertJson([
            'ok' => true,
            'collection_id' => $collection->id,
            'created' => 1,
        ]);

    expect($collection->items()->count())->toBe(1);
});

test('daily prompt quota rejects the next prompt', function () {
    config()->set('ai.daily_prompt_limit', 1);
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);
    AiActivityLogger::prompt($user, 'First prompt');

    $this->actingAs($user)
        ->postJson(route('ai.chat'), ['message' => 'Second prompt'])
        ->assertTooManyRequests()
        ->assertJsonPath('message', 'Limite giornaliero di prompt AI raggiunto.');
});
