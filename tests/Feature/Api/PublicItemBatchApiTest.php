<?php

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FieldTypeEnum;
use App\Jobs\DeliverOutboundWebhookJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

function configureBatchOutboundWebhook(): void
{
    $repository = app(SettingsRepositoryService::class);
    $repository->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'webhook_url', 'https://example.com/externa-hooks');
    $repository->set(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        'webhook_secret',
        ProjectSettingsService::encryptWebhookSecret('test-secret'),
    );
}

/**
 * @return array{collection: Collection, field: CollectionField}
 */
function makeBatchPostsCollection(): array
{
    $collection = Collection::query()->create([
        'name' => 'Batch Posts',
        'slug' => 'batch-posts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);

    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
        'settings' => ['required' => true],
        'sort_order' => 0,
    ]);

    return ['collection' => $collection, 'field' => $field];
}

it('batch creates updates and deletes with mixed valid and invalid items', function (): void {
    ['collection' => $collection] = makeBatchPostsCollection();
    grantPublicActions($collection, [
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);

    $create = $this->postJson('/api/v1/collections/batch-posts/items/batch', [
        'items' => [
            ['data' => ['title' => 'One']],
            ['data' => []],
            ['data' => ['title' => 'Three', 'unknown_field' => 'nope']],
        ],
    ])->assertOk();

    $create->assertJsonPath('meta.total', 3)
        ->assertJsonPath('meta.succeeded', 1)
        ->assertJsonPath('meta.failed', 2)
        ->assertJsonPath('data.0.ok', true)
        ->assertJsonPath('data.0.item.data.title', 'One')
        ->assertJsonPath('data.1.ok', false)
        ->assertJsonPath('data.1.error.status', 422)
        ->assertJsonPath('data.2.ok', false)
        ->assertJsonPath('data.2.error.status', 422);

    $createdId = (int) $create->json('data.0.item.id');
    expect(CollectionItem::query()->whereKey($createdId)->exists())->toBeTrue();

    $other = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $update = $this->patchJson('/api/v1/collections/batch-posts/items/batch', [
        'items' => [
            ['id' => $createdId, 'data' => ['title' => 'One updated']],
            ['id' => $other->id, 'data' => []],
            ['id' => 9_999_999, 'data' => ['title' => 'Missing']],
        ],
    ])->assertOk();

    $update->assertJsonPath('meta.succeeded', 1)
        ->assertJsonPath('meta.failed', 2)
        ->assertJsonPath('data.0.ok', true)
        ->assertJsonPath('data.0.item.data.title', 'One updated')
        ->assertJsonPath('data.1.ok', false)
        ->assertJsonPath('data.1.error.status', 422)
        ->assertJsonPath('data.2.ok', false)
        ->assertJsonPath('data.2.error.status', 404);

    $delete = $this->deleteJson('/api/v1/collections/batch-posts/items/batch', [
        'ids' => [$createdId, 9_999_999, $other->id],
    ])->assertOk();

    $delete->assertJsonPath('meta.succeeded', 2)
        ->assertJsonPath('meta.failed', 1)
        ->assertJsonPath('data.0.ok', true)
        ->assertJsonPath('data.0.id', $createdId)
        ->assertJsonPath('data.1.ok', false)
        ->assertJsonPath('data.1.error.status', 404)
        ->assertJsonPath('data.2.ok', true);

    expect(CollectionItem::query()->whereKey($createdId)->exists())->toBeFalse()
        ->and(CollectionItem::query()->whereKey($other->id)->exists())->toBeFalse();
});

it('rejects batch writes without collection write permission with 403', function (): void {
    ['collection' => $collection] = makeBatchPostsCollection();
    $auth = makeApiKeyForRole();
    grantRoleActions($auth['role'], $collection, [CollectionPermissionActionEnum::Read]);

    $this->withToken($auth['plain'])
        ->postJson('/api/v1/collections/batch-posts/items/batch', [
            'items' => [['data' => ['title' => 'Nope']]],
        ])
        ->assertForbidden();

    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $this->withToken($auth['plain'])
        ->patchJson('/api/v1/collections/batch-posts/items/batch', [
            'items' => [['id' => $item->id, 'data' => ['title' => 'Nope']]],
        ])
        ->assertForbidden();

    $this->withToken($auth['plain'])
        ->deleteJson('/api/v1/collections/batch-posts/items/batch', [
            'ids' => [$item->id],
        ])
        ->assertForbidden();
});

it('enforces the batch size limit', function (): void {
    ['collection' => $collection] = makeBatchPostsCollection();
    grantPublicActions($collection, [
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);

    config(['api.max_batch_size' => 2]);

    $this->postJson('/api/v1/collections/batch-posts/items/batch', [
        'items' => [
            ['data' => ['title' => 'A']],
            ['data' => ['title' => 'B']],
            ['data' => ['title' => 'C']],
        ],
    ])->assertUnprocessable()->assertJsonValidationErrors(['items']);

    $ids = CollectionItem::factory()->count(3)->create(['collection_id' => $collection->id])->pluck('id')->all();

    $this->patchJson('/api/v1/collections/batch-posts/items/batch', [
        'items' => array_map(fn (int $id): array => ['id' => $id, 'data' => ['title' => 'X']], $ids),
    ])->assertUnprocessable()->assertJsonValidationErrors(['items']);

    $this->deleteJson('/api/v1/collections/batch-posts/items/batch', [
        'ids' => $ids,
    ])->assertUnprocessable()->assertJsonValidationErrors(['ids']);
});

it('emits activity log entries and per-item webhook events for batch writes', function (): void {
    Queue::fake();
    configureBatchOutboundWebhook();

    ['collection' => $collection] = makeBatchPostsCollection();
    grantPublicActions($collection, [
        CollectionPermissionActionEnum::Create,
        CollectionPermissionActionEnum::Update,
        CollectionPermissionActionEnum::Delete,
    ]);

    $create = $this->postJson('/api/v1/collections/batch-posts/items/batch', [
        'items' => [
            ['data' => ['title' => 'Alpha']],
            ['data' => ['title' => 'Beta']],
        ],
    ])->assertOk();

    $firstId = (int) $create->json('data.0.item.id');
    $secondId = (int) $create->json('data.1.item.id');

    $createdWebhookCount = Queue::pushed(
        DeliverOutboundWebhookJob::class,
        fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.created',
    )->count();
    expect($createdWebhookCount)->toBe(2);

    $createdActivities = Activity::query()
        ->where('subject_type', CollectionItem::class)
        ->whereIn('subject_id', [$firstId, $secondId])
        ->where('event', 'created')
        ->count();
    expect($createdActivities)->toBeGreaterThanOrEqual(2);

    Queue::fake();

    $this->patchJson('/api/v1/collections/batch-posts/items/batch', [
        'items' => [
            ['id' => $firstId, 'data' => ['title' => 'Alpha 2']],
            ['id' => $secondId, 'data' => ['title' => 'Beta 2']],
        ],
    ])->assertOk();

    $updatedWebhookCount = Queue::pushed(
        DeliverOutboundWebhookJob::class,
        fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.updated',
    )->count();
    expect($updatedWebhookCount)->toBe(2);

    Queue::fake();

    $this->deleteJson('/api/v1/collections/batch-posts/items/batch', [
        'ids' => [$firstId, $secondId],
    ])->assertOk();

    $deletedWebhookCount = Queue::pushed(
        DeliverOutboundWebhookJob::class,
        fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.deleted',
    )->count();
    expect($deletedWebhookCount)->toBe(2);

    $deletedActivities = Activity::query()
        ->where('subject_type', CollectionItem::class)
        ->whereIn('subject_id', [$firstId, $secondId])
        ->where('event', 'deleted')
        ->count();
    expect($deletedActivities)->toBeGreaterThanOrEqual(2);
});
