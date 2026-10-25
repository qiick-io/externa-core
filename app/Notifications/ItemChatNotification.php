<?php

namespace App\Notifications;

use App\Notifications\Concerns\BroadcastsWithDatabase;
use Illuminate\Notifications\Notification;

/**
 * In-app notice when someone posts in a chat you follow or are mentioned in.
 */
class ItemChatNotification extends Notification
{
    use BroadcastsWithDatabase;

    public function __construct(
        public readonly string $chatId,
        public readonly ?int $collectionId,
        public readonly ?int $itemId,
        public readonly int $messageId,
        public readonly string $authorName,
        public readonly string $excerpt,
        public readonly bool $mentioned,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'chat',
            'title' => $this->mentioned
                ? $this->authorName.' mentioned you'
                : $this->authorName.' sent a message',
            'body' => $this->excerpt,
            'chat_id' => $this->chatId,
            'collection_id' => $this->collectionId,
            'item_id' => $this->itemId,
            'message_id' => $this->messageId,
            'url' => '/chat/'.$this->chatId,
        ];
    }
}
