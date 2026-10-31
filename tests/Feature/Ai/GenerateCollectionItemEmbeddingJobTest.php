<?php

use App\Jobs\Ai\GenerateCollectionItemEmbeddingJob;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemEmbedding;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Support\Facades\Log;
use Laravel\Ai\Embeddings;

it('stores an embedding vector on success', function () {
    config(['ai.embeddings.enabled' => true]);

    Embeddings::fake([
        [[0.25, 0.5, 0.75]],
    ]);

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    (new GenerateCollectionItemEmbeddingJob($item->id))->handle(
        app(CollectionItemValuesAssembler::class),
    );

    $row = CollectionItemEmbedding::query()->where('collection_item_id', $item->id)->first();
    expect($row)->not->toBeNull()
        ->and($row->vector)->toBe([0.25, 0.5, 0.75])
        ->and($row->content_hash)->not->toBeEmpty();
});

it('swallows provider failures without writing a row', function () {
    config(['ai.embeddings.enabled' => true]);

    Log::spy();
    Embeddings::fake(function () {
        throw new RuntimeException('provider down');
    });

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    (new GenerateCollectionItemEmbeddingJob($item->id))->handle(
        app(CollectionItemValuesAssembler::class),
    );

    expect(CollectionItemEmbedding::query()->where('collection_item_id', $item->id)->exists())->toBeFalse();
    Log::shouldHaveReceived('warning')->atLeast()->once();
});

it('no-ops when the collection item is missing', function () {
    config(['ai.embeddings.enabled' => true]);

    Embeddings::fake([
        [[1.0, 0.0]],
    ]);

    (new GenerateCollectionItemEmbeddingJob(9_999_999))->handle(
        app(CollectionItemValuesAssembler::class),
    );

    expect(CollectionItemEmbedding::query()->count())->toBe(0);
});
