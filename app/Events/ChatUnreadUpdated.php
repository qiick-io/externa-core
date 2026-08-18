<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Sidebar/hub unread totals for one user after a chat read or new message.
 */
class ChatUnreadUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $userId,
        public int $total,
        public int $private,
        public int $collection,
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
     * @return array{unread_count: int, unread_private: int, unread_collection: int}
     */
    public function broadcastWith(): array
    {
        return [
            'unread_count' => $this->total,
            'unread_private' => $this->private,
            'unread_collection' => $this->collection,
        ];
    }
}
