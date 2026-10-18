<?php

use App\Enums\FieldTypeEnum;
use App\Jobs\Search\DeleteCollectionItemFromMeilisearchJob;
use App\Jobs\Search\SyncCollectionItemToMeilisearchJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Search\MeilisearchClient;
use App\Services\Search\MeilisearchDocumentBuilder;
use App\Services\Search\MeilisearchSyncDispatcher;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'meilisearch.enabled' => true,
        'meilisearch.host' => 'http://meili.test',
        'meilisearch.api_key' => 'test-key',
        'meilisearch.index' => 'externa-test',
        'meilisearch.indexable_statuses' => ['published'],
    ]);
});

function meiliKitchen(array $extraFields = []): array
{
    $collection = Collection::factory()->create(['slug' => 'posts']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'status',
        'type' => FieldTypeEnum::String,
    ]);
    foreach ($extraFields as $field) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            ...$field,
        ]);
    }

    return compact('collection');
}

test('meilisearch dispatcher is a no-op when disabled', function () {
    Queue::fake();
    config(['meilisearch.enabled' => false]);

    ['collection' => $collection] = meiliKitchen();
    $item = $collection->items()->create([]);

    app(MeilisearchSyncDispatcher::class)->dispatchUpsert($item);

    Queue::assertNothingPushed();
});

test('values writer queues meilisearch sync job when enabled', function () {
    Queue::fake();
    ['collection' => $collection] = meiliKitchen();
    $item = $collection->items()->create([]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    $writer->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, [
            'title' => 'Hello',
            'status' => 'published',
        ], true),
        created: true,
    );

    Queue::assertPushed(SyncCollectionItemToMeilisearchJob::class, function (SyncCollectionItemToMeilisearchJob $job) use ($item): bool {
        return $job->itemId === $item->id;
    });
});

test('sync job upserts published documents and deletes ineligible status', function () {
    Http::fake([
        'meili.test/*' => Http::response(['taskUid' => 1], 202),
    ]);

    ['collection' => $collection] = meiliKitchen();
    $item = $collection->items()->create([]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    $writer->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, [
            'title' => 'Hello',
            'status' => 'published',
        ], true),
        created: true,
    );

    (new SyncCollectionItemToMeilisearchJob($item->id))->handle(
        app(MeilisearchClient::class),
        app(MeilisearchDocumentBuilder::class),
    );

    Http::assertSent(function ($request): bool {
        return $request->method() === 'POST'
            && str_contains($request->url(), '/indexes/externa-test/documents')
            && str_contains($request->url(), 'primaryKey=id')
            && ($request['0']['title'] ?? null) === 'Hello';
    });

    $writer->sync(
        $item->fresh(),
        $collection,
        $normalizer->normalize($collection, [
            'title' => 'Hello',
            'status' => 'draft',
        ], false),
        created: false,
    );

    Http::fake([
        'meili.test/*' => Http::response(null, 204),
    ]);

    (new SyncCollectionItemToMeilisearchJob($item->id))->handle(
        app(MeilisearchClient::class),
        app(MeilisearchDocumentBuilder::class),
    );

    Http::assertSent(function ($request) use ($item): bool {
        return $request->method() === 'DELETE'
            && str_contains($request->url(), '/indexes/externa-test/documents/'.$item->id);
    });
});

test('deleting an item queues meilisearch delete job', function () {
    Queue::fake();
    ['collection' => $collection] = meiliKitchen();
    $item = $collection->items()->create([]);

    $item->delete();

    Queue::assertPushed(DeleteCollectionItemFromMeilisearchJob::class, function (DeleteCollectionItemFromMeilisearchJob $job) use ($item): bool {
        return $job->documentId === (string) $item->id;
    });
});

test('withoutMeilisearch suppresses sync during bulk style writes', function () {
    Queue::fake();
    ['collection' => $collection] = meiliKitchen();
    $item = $collection->items()->create([]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    $writer = app(CollectionItemValuesWriter::class);

    MeilisearchSyncDispatcher::withoutMeilisearch(function () use ($writer, $item, $collection, $normalizer): void {
        $writer->sync(
            $item,
            $collection,
            $normalizer->normalize($collection, [
                'title' => 'Bulk',
                'status' => 'published',
            ], true),
            created: true,
        );
    });

    Queue::assertNotPushed(SyncCollectionItemToMeilisearchJob::class);
});
