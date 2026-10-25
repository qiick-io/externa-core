<?php

namespace App\Services\Collections;

use App\Enums\ItemApprovalStatus;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Notifications\ItemApprovalNotification;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Submit / approve / reject transitions for editorial approvals.
 */
class CollectionItemApprovalService
{
    public function __construct(
        private OutboundWebhookDispatcher $webhooks,
    ) {}

    public function submit(CollectionItem $item, Collection $collection, User $actor): void
    {
        $this->assertApprovalsEnabled($collection);

        if (! is_array($item->draft_data)) {
            throw ValidationException::withMessages([
                'approval' => __('Save a draft before submitting for review.'),
            ]);
        }

        $status = $this->status($item);
        if (! in_array($status, [ItemApprovalStatus::Draft, ItemApprovalStatus::Rejected], true)) {
            throw ValidationException::withMessages([
                'approval' => __('Item is already in review or approved.'),
            ]);
        }

        $item->approval_status = ItemApprovalStatus::InReview->value;
        $item->rejection_note = null;
        $item->submitted_by = $actor->id;
        $item->reviewed_by = null;
        $item->reviewed_at = null;
        $item->save();

        $this->webhooks->dispatchItem('item.submitted', $item->fresh(), $collection);
        $this->notifyReviewers($item->fresh(), $collection, 'submitted', $actor);
    }

    public function approve(CollectionItem $item, Collection $collection, User $actor): void
    {
        $this->assertApprovalsEnabled($collection);

        if ($this->status($item) !== ItemApprovalStatus::InReview) {
            throw ValidationException::withMessages([
                'approval' => __('Only items in review can be approved.'),
            ]);
        }

        $item->approval_status = ItemApprovalStatus::Approved->value;
        $item->rejection_note = null;
        $item->reviewed_by = $actor->id;
        $item->reviewed_at = Carbon::now();
        $item->save();

        $this->webhooks->dispatchItem('item.approved', $item->fresh(), $collection);
        $this->notifySubmitter($item->fresh(), $collection, 'approved', $actor);
    }

    public function reject(CollectionItem $item, Collection $collection, User $actor, string $note): void
    {
        $this->assertApprovalsEnabled($collection);

        $note = trim($note);
        if ($note === '') {
            throw ValidationException::withMessages([
                'rejection_note' => __('A rejection note is required.'),
            ]);
        }

        if ($this->status($item) !== ItemApprovalStatus::InReview) {
            throw ValidationException::withMessages([
                'approval' => __('Only items in review can be rejected.'),
            ]);
        }

        $item->approval_status = ItemApprovalStatus::Rejected->value;
        $item->rejection_note = $note;
        $item->reviewed_by = $actor->id;
        $item->reviewed_at = Carbon::now();
        $item->save();

        $this->webhooks->dispatchItem('item.rejected', $item->fresh(), $collection, [
            'rejection_note' => $note,
        ]);
        $this->notifySubmitter($item->fresh(), $collection, 'rejected', $actor, $note);
    }

    /**
     * Reset approval when draft is discarded or approval is invalidated by edits.
     */
    public function resetToDraft(CollectionItem $item): void
    {
        $item->approval_status = ItemApprovalStatus::Draft->value;
        $item->rejection_note = null;
        $item->submitted_by = null;
        $item->reviewed_by = null;
        $item->reviewed_at = null;
        $item->save();
    }

    /**
     * After promote: clear approval state alongside draft.
     */
    public function clearAfterPromote(CollectionItem $item): void
    {
        $item->approval_status = ItemApprovalStatus::Draft->value;
        $item->rejection_note = null;
        $item->submitted_by = null;
        $item->reviewed_by = null;
        $item->reviewed_at = null;
    }

    public function assertPromotable(CollectionItem $item, Collection $collection): void
    {
        if (! $collection->approvals_required) {
            return;
        }

        if ($this->status($item) !== ItemApprovalStatus::Approved) {
            throw new RuntimeException('Item must be approved before publishing.');
        }
    }

    private function assertApprovalsEnabled(Collection $collection): void
    {
        if (! $collection->versioning || ! $collection->approvals_required) {
            throw ValidationException::withMessages([
                'approval' => __('Approvals are not enabled for this collection.'),
            ]);
        }
    }

    private function status(CollectionItem $item): ItemApprovalStatus
    {
        return ItemApprovalStatus::tryFrom((string) $item->approval_status) ?? ItemApprovalStatus::Draft;
    }

    private function notifyReviewers(CollectionItem $item, Collection $collection, string $action, User $actor): void
    {
        $reviewers = User::permission(PermissionEnum::CanApproveCollections->value)
            ->where('id', '!=', $actor->id)
            ->get();

        if ($reviewers->isEmpty()) {
            return;
        }

        Notification::send($reviewers, new ItemApprovalNotification(
            action: $action,
            collectionId: $collection->id,
            collectionName: $collection->name,
            itemId: $item->id,
            actorName: $actor->name,
            rejectionNote: null,
        ));
    }

    private function notifySubmitter(
        CollectionItem $item,
        Collection $collection,
        string $action,
        User $actor,
        ?string $rejectionNote = null,
    ): void {
        $submitterId = $item->submitted_by;
        if (! is_int($submitterId) || $submitterId === $actor->id) {
            return;
        }

        $submitter = User::query()->find($submitterId);
        if ($submitter === null) {
            return;
        }

        $submitter->notify(new ItemApprovalNotification(
            action: $action,
            collectionId: $collection->id,
            collectionName: $collection->name,
            itemId: $item->id,
            actorName: $actor->name,
            rejectionNote: $rejectionNote,
        ));
    }
}
