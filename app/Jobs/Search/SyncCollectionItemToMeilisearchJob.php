<?php

namespace App\Jobs\Search;

use App\Models\CollectionItem;
use App\Services\Search\MeilisearchClientService;
use App\Services\Search\MeilisearchDocumentBuilderService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Upsert one published collection item into Meilisearch (or delete if ineligible).
 */
class SyncCollectionItemToMeilisearchJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 20;

    public function __construct(
        public readonly int $itemId,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [15, 45];
    }

    public function handle(
        MeilisearchClientService $client,
        MeilisearchDocumentBuilderService $builder,
    ): void {
        if (! $client->enabled()) {
            return;
        }

        $item = CollectionItem::query()->find($this->itemId);
        if (! $item instanceof CollectionItem) {
            $client->deleteDocument((string) $this->itemId);

            return;
        }

        $built = $builder->build($item);
        if (! $built['eligible'] || $built['document'] === null) {
            $client->deleteDocument($builder->documentId($item));

            return;
        }

        $client->upsertDocuments([$built['document']]);
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Meilisearch item sync exhausted retries', [
            'item_id' => $this->itemId,
            'message' => $exception?->getMessage(),
        ]);
    }
}
