<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Hub sidebar: upsert one thread row for a participant (new DM or first/later message bump).
 */
class ChatThreadUpserted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $chat
     */
    public function __construct(
        public int $userId,
        public array $chat,
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
        return 'ThreadUpserted';
    }

    /**
     * @return array{chat: array<string, mixed>}
     */
    public function broadcastWith(): array
    {
        return ['chat' => $this->chat];
    }
}
