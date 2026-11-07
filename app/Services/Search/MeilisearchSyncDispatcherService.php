<?php

namespace App\Services\Search;

use App\Jobs\Search\DeleteCollectionItemFromMeilisearchJob;
use App\Jobs\Search\SyncCollectionItemToMeilisearchJob;
use App\Models\CollectionItem;

/**
 * Queues Meilisearch upsert/delete for published collection items.
 *
 * Bulk imports call {@see withoutMeilisearch()} (nestable) like outbound webhooks.
 */
class MeilisearchSyncDispatcherService
{
    private static int $suppressDepth = 0;

    public function __construct(
        private readonly MeilisearchClientService $client,
    ) {}

    /**
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function withoutMeilisearch(callable $callback): mixed
    {
        self::$suppressDepth++;

        try {
            return $callback();
        } finally {
            self::$suppressDepth--;
        }
    }

    public static function suppressed(): bool
    {
        return self::$suppressDepth > 0;
    }

    public function dispatchUpsert(CollectionItem $item): void
    {
        if (self::suppressed() || ! $this->client->isEnabled()) {
            return;
        }

        $pending = SyncCollectionItemToMeilisearchJob::dispatch((int) $item->id);
        if (! app()->runningUnitTests()) {
            $pending->afterCommit();
        }
    }

    public function dispatchDelete(CollectionItem $item): void
    {
        if (self::suppressed() || ! $this->client->isEnabled()) {
            return;
        }

        $pending = DeleteCollectionItemFromMeilisearchJob::dispatch((string) $item->id);
        if (! app()->runningUnitTests()) {
            $pending->afterCommit();
        }
    }
}
