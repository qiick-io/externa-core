<?php

namespace App\Services\Webhooks;

use App\Jobs\DeliverOutboundWebhookJob;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\File;
use App\Services\Settings\ProjectSettings;
use Illuminate\Support\Str;

/**
 * Queues outbound domain events to the project webhook URL when configured.
 *
 * Bulk imports call {@see withoutWebhooks()} to avoid flooding the consumer.
 */
class OutboundWebhookDispatcher
{
    private static int $suppressDepth = 0;

    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    /**
     * Run $callback with webhook emission suppressed (nestable).
     *
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function withoutWebhooks(callable $callback): mixed
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

    /**
     * @param  array<string, mixed>  $data
     */
    public function dispatch(string $type, array $data = []): void
    {
        if (self::suppressed()) {
            return;
        }

        $url = $this->projectSettings->webhookUrl();
        if ($url === null) {
            return;
        }

        $pending = DeliverOutboundWebhookJob::dispatch(
            'evt_'.Str::lower((string) Str::ulid()),
            $type,
            now()->utc()->format('Y-m-d\TH:i:s\Z'),
            $data,
        );

        // RefreshDatabase wraps tests in a transaction; afterCommit never fires there.
        if (! app()->runningUnitTests()) {
            $pending->afterCommit();
        }
    }

    public function dispatchItem(string $type, CollectionItem $item, ?Collection $collection = null): void
    {
        $collection ??= $item->relationLoaded('collection')
            ? $item->collection
            : $item->collection()->first();

        $this->dispatch($type, [
            'collection_id' => $item->collection_id,
            'collection_slug' => $collection?->slug,
            'item_id' => $item->id,
        ]);
    }

    public function dispatchCollection(string $type, Collection $collection): void
    {
        $this->dispatch($type, [
            'collection_id' => $collection->id,
            'collection_slug' => $collection->slug,
        ]);
    }

    public function dispatchFile(string $type, File $file): void
    {
        $this->dispatch($type, [
            'file_id' => $file->id,
        ]);
    }

    public function dispatchPing(): void
    {
        $this->dispatch('ping', []);
    }
}
