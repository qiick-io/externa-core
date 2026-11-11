<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Events\ItemChatMessageUpdatedEvent;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Chat\ChatMessageSerializerService;

/**
 * Pin or unpin a message; any member of the thread may.
 */
class PinChatMessageAction
{
    public function __construct(
        private ChatMessageSerializerService $serializer,
    ) {}

    /**
     * Broadcasts `ItemChatMessageUpdatedEvent`.
     *
     * @return array<string, mixed> The serialized message as the viewer sees it
     */
    public function execute(Chat $chat, CollectionItemChatMessage $message, User $viewer, bool $isPinned): array
    {
        $message->fill(['pinned_at' => $isPinned ? now() : null]);
        $message->save();

        $message->load($this->serializer->messageRelations());
        $payload = $this->serializer->serializeMessage($message, $viewer);
        event(new ItemChatMessageUpdatedEvent($chat->id, $payload));

        return $payload;
    }
}
