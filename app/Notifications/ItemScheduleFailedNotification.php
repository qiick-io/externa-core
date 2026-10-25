<?php

namespace App\Notifications;

use App\Notifications\Concerns\BroadcastsWithDatabaseTrait;
use Illuminate\Notifications\Notification;

/**
 * In-app notice when a scheduled publish fails (approval reset, promote error, …).
 */
class ItemScheduleFailedNotification extends Notification
{
    use BroadcastsWithDatabaseTrait;

    public function __construct(
        public readonly int $collectionId,
        public readonly string $collectionName,
        public readonly int $itemId,
        public readonly string $errorMessage,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'item_schedule_failed',
            'title' => __('Scheduled publish failed'),
            'body' => __('Scheduled publish for an item in :collection failed: :error', [
                'collection' => $this->collectionName,
                'error' => $this->errorMessage,
            ]),
            'collection_id' => $this->collectionId,
            'item_id' => $this->itemId,
            'error' => $this->errorMessage,
            'url' => '/collections/'.$this->collectionId.'/items/'.$this->itemId.'?version=draft',
        ];
    }
}
