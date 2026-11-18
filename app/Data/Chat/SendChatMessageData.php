<?php

declare(strict_types=1);

namespace App\Data\Chat;

use App\Models\Chat;
use App\Models\User;

/**
 * Input for `SendChatMessageAction`: a new message on a thread, as the hub
 * route and the item-form alias receive it.
 */
readonly class SendChatMessageData
{
    /**
     * @param  string  $body  Trimmed body, may be empty when attachments are sent
     * @param  list<string>  $attachmentIds  Unique ids of the author's unclaimed attachments
     * @param  list<mixed>  $mentionedUserIds  Raw mentioned user ids, checked by the action
     */
    public function __construct(
        public Chat $chat,
        public User $author,
        public string $body,
        public array $attachmentIds,
        public array $mentionedUserIds,
        public ?int $replyToId,
    ) {}

    /**
     * @param  array<string, mixed>  $validated  `StoreChatMessageRequest::validated()`
     */
    public static function fromValidated(Chat $chat, User $author, array $validated): self
    {
        return new self(
            chat: $chat,
            author: $author,
            body: trim((string) ($validated['body'] ?? '')),
            attachmentIds: array_values(array_unique($validated['attachment_ids'] ?? [])),
            mentionedUserIds: $validated['mentioned_user_ids'] ?? [],
            replyToId: isset($validated['reply_to_id']) ? (int) $validated['reply_to_id'] : null,
        );
    }
}
