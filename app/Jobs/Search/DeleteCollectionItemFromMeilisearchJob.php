<?php

namespace App\Jobs\Search;

use App\Services\Search\MeilisearchClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Remove one collection item document from Meilisearch.
 */
class DeleteCollectionItemFromMeilisearchJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 15;

    public function __construct(
        public readonly string $documentId,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [15, 45];
    }

    public function handle(MeilisearchClient $client): void
    {
        $client->deleteDocument($this->documentId);
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Meilisearch item delete exhausted retries', [
            'document_id' => $this->documentId,
            'message' => $exception?->getMessage(),
        ]);
    }
}
