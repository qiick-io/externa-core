<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Data\Chat\SendChatMessageData;
use App\Events\ItemChatMessageCreatedEvent;
use App\Models\Chat;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Chat\ChatMentionService;
use App\Services\Chat\ChatMessageSerializerService;
use App\Services\Chat\ChatNotificationService;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Post a message on a thread: one path for the hub route and the item-form
 * alias. Claims the author's uploaded attachments, then notifies, updates
 * unread counts and broadcasts once the write is committed.
 */
class SendChatMessageAction
{
    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private ChatMentionService $mentions,
        private ChatNotificationService $notifications,
        private ChatMessageSerializerService $serializer,
    ) {}

    /**
     * Side effects after commit: `ItemChatNotification`s, unread broadcasts,
     * `ItemChatMessageCreatedEvent` (each failure is reported, never thrown)
     * and a `chat_message` activity-log entry.
     *
     * @return array<string, mixed> The serialized message as the author sees it
     *
     * @throws ValidationException When the message is empty, a mention is not allowed, or an attachment is invalid or expired
     */
    public function execute(SendChatMessageData $send): array
    {
        $chat = $send->chat;
        $user = $send->author;
        $body = $send->body;
        $attachmentIds = $send->attachmentIds;

        if ($body === '' && $attachmentIds === []) {
            throw ValidationException::withMessages([
                'body' => __('Message body or an attachment is required.'),
            ]);
        }

        $mentionedIds = $this->mentions->validatedMentionIds($chat, $send->mentionedUserIds);
        $this->mentions->assertCollectionMentions($user, $body);
        $replyToId = $this->validatedReplyToId($chat, $send->replyToId);

        /** @var array{0: CollectionItemChatMessage, 1: list<CollectionItemChatAttachment>} $written */
        $written = CollectionItemChatMessage::query()->getConnection()->transaction(function () use ($chat, $user, $body, $mentionedIds, $replyToId, $attachmentIds): array {
            $attachments = $this->claimOrphanAttachments($user, $attachmentIds);

            $message = CollectionItemChatMessage::query()->create([
                'chat_id' => $chat->id,
                'user_id' => $user->id,
                'body' => $body,
                'mentioned_user_ids' => $mentionedIds,
                'reply_to_id' => $replyToId,
            ]);

            foreach ($attachments as $attachment) {
                $attachment->message_id = $message->id;
                $attachment->expires_at = null;
                $attachment->save();
            }

            $chat->touch();
            $this->chats->unarchiveDirectChatForRecipients($chat, $user);

            return [$message, $attachments];
        });

        [$message, $attachments] = $written;
        $message->load($this->serializer->messageRelations());
        $payload = $this->serializer->serializeMessage($message, $user);

        // Side effects after commit; broadcast failures must not 500 a saved write.
        try {
            $this->notifications->notifyRecipients($chat, $message, $user, $mentionedIds);
        } catch (Throwable $e) {
            report($e);
        }

        try {
            $this->unread->afterMessageCreated($chat, $message, $user, $mentionedIds);
        } catch (Throwable $e) {
            report($e);
        }

        try {
            event(new ItemChatMessageCreatedEvent($chat->id, $payload));
        } catch (Throwable $e) {
            report($e);
        }

        activity()
            ->causedBy($user)
            ->performedOn($message)
            ->useLog('chat')
            ->event('chat_message')
            ->withProperties([
                'chat_id' => $chat->id,
                'body_preview' => Str::limit($body, 120),
                'attachment_count' => count($attachments),
                'mentioned_count' => count($mentionedIds),
                'reply_to_id' => $replyToId,
            ])
            ->log('Chat message sent');

        return $payload;
    }

    /**
     * A reply must target a message on the same thread (404 unknown, 422 other thread).
     */
    private function validatedReplyToId(Chat $chat, ?int $replyToId): ?int
    {
        if ($replyToId === null) {
            return null;
        }

        $target = CollectionItemChatMessage::query()->find($replyToId);
        abort_unless($target instanceof CollectionItemChatMessage, 404);
        abort_unless((string) $target->chat_id === (string) $chat->id, 422);

        return (int) $target->id;
    }

    /**
     * Lock the author's unclaimed, unexpired attachments for claiming.
     *
     * @param  list<string>  $ids
     * @return list<CollectionItemChatAttachment>
     *
     * @throws ValidationException When an id is unknown, claimed, foreign or expired
     */
    private function claimOrphanAttachments(User $user, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $attachments = CollectionItemChatAttachment::query()
            ->whereIn('id', $ids)
            ->where('user_id', $user->id)
            ->whereNull('message_id')
            ->lockForUpdate()
            ->get();

        if ($attachments->count() !== count($ids)) {
            throw ValidationException::withMessages([
                'attachment_ids' => __('One or more attachments are invalid.'),
            ]);
        }

        foreach ($attachments as $attachment) {
            if ($attachment->isExpired()) {
                throw ValidationException::withMessages([
                    'attachment_ids' => __('One or more attachments have expired.'),
                ]);
            }
        }

        return $attachments->all();
    }
}
