<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\GitExport\GitExportDispatcher;
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
        private GitExportDispatcher $gitExport,
        private CollectionItemApprovalService $approvals,
    ) {}

    /**
     * @throws RuntimeException when no draft, versioning off, or approvals block promote
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

        $this->approvals->assertPromotable($item, $collection);

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
        $this->approvals->clearAfterPromote($item);
        $item->save();

        $published = $item->fresh();
        $this->webhooks->dispatchItem('item.published', $published, $collection, [
            'scheduled' => $scheduled,
        ]);
        $this->gitExport->dispatchItem($published);
    }
}
