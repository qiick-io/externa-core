<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Realtime payload when a chat reaction is added or removed.
 */
class ItemChatReactionToggled implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $chatId,
        public int $messageId,
        public int $userId,
        public string $emoji,
        public bool $added,
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
        return 'ReactionToggled';
    }

    /**
     * @return array{message_id: int, user_id: int, emoji: string, added: bool}
     */
    public function broadcastWith(): array
    {
        return [
            'message_id' => $this->messageId,
            'user_id' => $this->userId,
            'emoji' => $this->emoji,
            'added' => $this->added,
        ];
    }
}
