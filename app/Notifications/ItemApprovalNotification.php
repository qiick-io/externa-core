<?php

namespace App\Notifications;

use App\Notifications\Concerns\BroadcastsWithDatabase;
use Illuminate\Notifications\Notification;

/**
 * In-app notice for editorial approval transitions (submit / approve / reject).
 */
class ItemApprovalNotification extends Notification
{
    use BroadcastsWithDatabase;

    public function __construct(
        public readonly string $action,
        public readonly int $collectionId,
        public readonly string $collectionName,
        public readonly int $itemId,
        public readonly string $actorName,
        public readonly ?string $rejectionNote = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        [$title, $body] = match ($this->action) {
            'submitted' => [
                __('Ready for review'),
                __(':actor submitted an item in :collection for review.', [
                    'actor' => $this->actorName,
                    'collection' => $this->collectionName,
                ]),
            ],
            'approved' => [
                __('Item approved'),
                __(':actor approved your item in :collection.', [
                    'actor' => $this->actorName,
                    'collection' => $this->collectionName,
                ]),
            ],
            'rejected' => [
                __('Item rejected'),
                $this->rejectionNote !== null && $this->rejectionNote !== ''
                    ? __(':actor rejected your item in :collection: :note', [
                        'actor' => $this->actorName,
                        'collection' => $this->collectionName,
                        'note' => $this->rejectionNote,
                    ])
                    : __(':actor rejected your item in :collection.', [
                        'actor' => $this->actorName,
                        'collection' => $this->collectionName,
                    ]),
            ],
            default => [
                __('Approval update'),
                __(':actor updated approval status in :collection.', [
                    'actor' => $this->actorName,
                    'collection' => $this->collectionName,
                ]),
            ],
        };

        return [
            'type' => 'item_approval',
            'action' => $this->action,
            'title' => $title,
            'body' => $body,
            'collection_id' => $this->collectionId,
            'item_id' => $this->itemId,
            'rejection_note' => $this->rejectionNote,
            'url' => '/collections/'.$this->collectionId.'/items/'.$this->itemId.'?version=draft',
        ];
    }
}
