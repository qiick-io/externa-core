<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\GitExport\GitExportDispatcher;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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
     * Promote under a single DB transaction with a row lock so sync + draft clear cannot diverge.
     *
     * Side effects (webhooks / git export) run only after the transaction commits.
     *
     * @throws RuntimeException when no draft, versioning off, or approvals block promote
     */
    public function promote(CollectionItem $item, Collection $collection, bool $scheduled = false): void
    {
        if (! $collection->versioning) {
            throw new RuntimeException('Collection versioning is disabled.');
        }

        DB::transaction(function () use ($item, $collection, $scheduled): void {
            /** @var CollectionItem|null $locked */
            $locked = CollectionItem::query()
                ->whereKey($item->id)
                ->lockForUpdate()
                ->first();

            if ($locked === null) {
                throw new RuntimeException('Collection item no longer exists.');
            }

            $draft = is_array($locked->draft_data) ? $locked->draft_data : null;
            if ($draft === null) {
                throw new RuntimeException('No draft changes to publish.');
            }

            $this->approvals->assertPromotable($locked, $collection);

            $normalized = $this->normalizer->normalize($collection, $draft, false);
            $this->writer->sync(
                $locked,
                $collection,
                $normalized,
                created: false,
                revisionMeta: [
                    'source' => 'publish',
                    'scheduled' => $scheduled,
                ],
            );

            $locked->draft_data = null;
            $locked->publish_at = null;
            $locked->clearScheduleFailure();
            $locked->published_at = Carbon::now();
            $this->approvals->clearAfterPromote($locked);
            $locked->save();
        });

        $published = $item->fresh();
        if ($published === null) {
            return;
        }

        $this->webhooks->dispatchItem('item.published', $published, $collection, [
            'scheduled' => $scheduled,
        ]);
        $this->gitExport->dispatchItem($published);
    }
}
