<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use RuntimeException;

/**
 * Promote draft_data into published values (manual or scheduled).
 */
class CollectionItemPublisher
{
    public function __construct(
        private CollectionItemDataNormalizer $normalizer,
        private CollectionItemValuesWriter $writer,
        private OutboundWebhookDispatcher $webhooks,
    ) {}

    /**
     * @throws RuntimeException when no draft or versioning off
     */
    public function promote(CollectionItem $item, Collection $collection, bool $scheduled = false): void
    {
        if (! $collection->versioning) {
            throw new RuntimeException('Collection versioning is disabled.');
        }

        $draft = is_array($item->draft_data) ? $item->draft_data : null;
        if ($draft === null) {
            throw new RuntimeException('No draft changes to publish.');
        }

        $normalized = $this->normalizer->normalize($collection, $draft, false);
        $this->writer->sync(
            $item->fresh(),
            $collection,
            $normalized,
            created: false,
            revisionMeta: [
                'source' => 'publish',
                'scheduled' => $scheduled,
            ],
        );

        $item->draft_data = null;
        $item->publish_at = null;
        $item->save();

        $this->webhooks->dispatchItem('item.published', $item->fresh(), $collection, [
            'scheduled' => $scheduled,
        ]);
    }
}
