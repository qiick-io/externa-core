<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\CollectionItem;

/**
 * Save or clear the publish / unpublish schedule of a versioned collection item.
 *
 * The draft workspace schedules the draft promote (`publish_at`) and the unpublish pair;
 * the published workspace never reschedules the promote and only sets the soft-delete
 * unpublish time. The caller validates the request (ordering, draft present, approval).
 */
final class ScheduleCollectionItemAction
{
    /**
     * @param  'draft'|'published'  $version  Workspace the schedule was edited in
     * @param  bool  $shouldClear  Clear the schedule instead of saving it
     * @param  bool  $hasPublishAt  The request sent a `publish_at` key
     * @param  bool  $hasUnpublishAt  The request sent an `unpublish_at` key
     * @param  mixed  $publishAt  Validated `publish_at` (null when absent or cleared)
     * @param  mixed  $unpublishAt  Validated `unpublish_at` (null when absent or cleared)
     */
    public function execute(
        CollectionItem $item,
        string $version,
        bool $shouldClear,
        bool $hasPublishAt = false,
        bool $hasUnpublishAt = false,
        mixed $publishAt = null,
        mixed $unpublishAt = null,
    ): void {
        if ($shouldClear) {
            // Published workspace: only clear unpublish; keep draft promote schedule.
            if ($version === 'published') {
                $item->unpublish_at = null;
            } else {
                $item->publish_at = null;
                $item->unpublish_at = null;
                $item->clearScheduleFailure();
            }
            $item->save();

            return;
        }

        // Published workspace never reschedules promote; only soft-delete unpublish.
        if ($version === 'published') {
            $item->unpublish_at = $hasUnpublishAt ? $unpublishAt : $item->unpublish_at;
        } else {
            if ($hasPublishAt) {
                $item->publish_at = $publishAt;
                $item->clearScheduleFailure();
            }
            if ($hasUnpublishAt) {
                $item->unpublish_at = $unpublishAt;
            }
            // Legacy clients that always send both keys.
            if (! $hasPublishAt && ! $hasUnpublishAt) {
                $item->publish_at = $publishAt;
                $item->unpublish_at = $unpublishAt;
                $item->clearScheduleFailure();
            }
        }
        $item->save();
    }
}
