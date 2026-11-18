<?php

declare(strict_types=1);

namespace App\Actions\Collections;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemApprovalService;
use App\Services\Collections\CollectionItemRevisionRecorderService;

/**
 * Discard the unpublished `draft_data` of a versioned item; published values stay untouched.
 *
 * Also drops the draft promote schedule and, on collections with approvals, resets the
 * approval state to draft. Records a `discard_draft` revision.
 */
final class DiscardCollectionItemDraftAction
{
    public function __construct(
        private CollectionItemRevisionRecorderService $revisionRecorder,
        private CollectionItemApprovalService $itemApprovals,
    ) {}

    public function execute(CollectionItem $item, Collection $collection): void
    {
        $item->draft_data = null;
        $item->publish_at = null;
        $item->clearScheduleFailure();
        if ($collection->approvals_required) {
            $this->itemApprovals->resetToDraft($item);
        } else {
            $item->save();
        }

        $this->revisionRecorder->record($item, [
            'source' => 'discard_draft',
        ]);
    }
}
