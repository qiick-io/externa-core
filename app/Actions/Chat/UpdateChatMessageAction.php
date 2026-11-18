<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Events\ItemChatMessageUpdatedEvent;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Chat\ChatMentionService;
use App\Services\Chat\ChatMessageSerializerService;
use Illuminate\Validation\ValidationException;

/**
 * Edit a message's body and mentions. The caller has checked that the
 * editor wrote the message (`UpdateChatMessageRequest::authorize()`).
 */
class UpdateChatMessageAction
{
    public function __construct(
        private ChatMentionService $mentions,
        private ChatMessageSerializerService $serializer,
    ) {}

    /**
     * Broadcasts `ItemChatMessageUpdatedEvent`.
     *
     * @param  list<mixed>|null  $mentionedUserIds  Null keeps the current mentions
     * @return array<string, mixed> The serialized message as the editor sees it
     *
     * @throws ValidationException When a mention is not allowed
     */
    public function execute(
        Chat $chat,
        CollectionItemChatMessage $message,
        User $editor,
        string $body,
        ?array $mentionedUserIds,
    ): array {
        $message->body = trim($body);
        $this->mentions->assertCollectionMentions($editor, $message->body);
        $message->fill(['mentioned_user_ids' => $this->mentions->validatedMentionIds(
            $chat,
            $mentionedUserIds ?? $message->mentionedIds(),
        )]);
        $message->save();

        $message->load($this->serializer->messageRelations());
        $payload = $this->serializer->serializeMessage($message, $editor);
        event(new ItemChatMessageUpdatedEvent($chat->id, $payload));

        return $payload;
    }
}
