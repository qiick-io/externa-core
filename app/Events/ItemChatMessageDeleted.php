<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Realtime payload when a chat message is deleted.
 */
class ItemChatMessageDeleted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $chatId,
        public int $messageId,
    ) {}

    /**
     * @return list<PresenceChannel>
     */
    public function broadcastOn(): array
    {
        return [
            new PresenceChannel('chat.'.$this->chatId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'MessageDeleted';
    }

    /**
     * @return array{id: int}
     */
    public function broadcastWith(): array
    {
        return ['id' => $this->messageId];
    }
}
