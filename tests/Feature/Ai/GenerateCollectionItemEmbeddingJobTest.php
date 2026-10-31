<?php

use App\Jobs\Ai\GenerateCollectionItemEmbeddingJob;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemEmbedding;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Support\Facades\Exceptions;
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

it('reports provider failures without writing a row', function () {
    config(['ai.embeddings.enabled' => true]);
    Exceptions::fake();

    Embeddings::fake(function () {
        throw new RuntimeException('provider down');
    });

    $collection = Collection::factory()->create();
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    (new GenerateCollectionItemEmbeddingJob($item->id))->handle(
        app(CollectionItemValuesAssembler::class),
    );

    expect(CollectionItemEmbedding::query()->where('collection_item_id', $item->id)->exists())->toBeFalse();
    Exceptions::assertReported(RuntimeException::class);
});

it('logs a warning from failed() after embedding retries are exhausted', function () {
    Log::spy();

    $job = new GenerateCollectionItemEmbeddingJob(7);
    $job->failed(new RuntimeException('provider down'));

    Log::shouldHaveReceived('warning')->atLeast()->once();
});

it('is unique per collection item id', function () {
    $job = new GenerateCollectionItemEmbeddingJob(42);

    expect($job)->toBeInstanceOf(ShouldBeUnique::class)
        ->and($job->uniqueId())->toBe('42');
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
