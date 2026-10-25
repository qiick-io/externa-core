<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Realtime payload when a chat message is posted.
 */
class ItemChatMessageCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $message
     */
    public function __construct(
        public string $chatId,
        public array $message,
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
        return 'MessageCreated';
    }

    /**
     * @return array{message: array<string, mixed>}
     */
    public function broadcastWith(): array
    {
        return ['message' => $this->message];
    }
}
