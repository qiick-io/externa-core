<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Sidebar/hub unread totals for one user after a chat read or new message.
 * Optional chat_id + chat_unread_count let the hub thread list patch per-row badges.
 */
class ChatUnreadUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $userId,
        public int $total,
        public int $private,
        public int $collection,
        public ?string $chatId = null,
        public ?int $chatUnreadCount = null,
        /** True when a new message should beep (recipients + live viewers; not mark-read). */
        public bool $playSound = false,
    ) {}

    /**
     * @return list<PrivateChannel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.'.$this->userId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'ChatUnreadUpdated';
    }

    /**
     * @return array{
     *     unread_count: int,
     *     unread_private: int,
     *     unread_collection: int,
     *     chat_id: ?string,
     *     chat_unread_count: ?int,
     *     play_sound: bool
     * }
     */
    public function broadcastWith(): array
    {
        return [
            'unread_count' => $this->total,
            'unread_private' => $this->private,
            'unread_collection' => $this->collection,
            'chat_id' => $this->chatId,
            'chat_unread_count' => $this->chatUnreadCount,
            'play_sound' => $this->playSound,
        ];
    }
}
