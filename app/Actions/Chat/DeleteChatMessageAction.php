<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Events\ItemChatMessageDeletedEvent;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Delete a message. The caller has checked thread access and that the
 * current user wrote it.
 */
class DeleteChatMessageAction
{
    /**
     * Broadcasts `ItemChatMessageDeletedEvent` and writes a
     * `chat_message_deleted` activity-log entry.
     */
    public function execute(Chat $chat, CollectionItemChatMessage $message, User $user): void
    {
        $messageId = (int) $message->id;
        $chatId = (int) $chat->id;
        $attachmentCount = $message->attachments()->count();
        $bodyPreview = Str::limit((string) $message->body, 120);

        $message->delete();
        event(new ItemChatMessageDeletedEvent($chat->id, $messageId));

        activity()
            ->causedBy($user)
            ->useLog('chat')
            ->event('chat_message_deleted')
            ->withProperties([
                'chat_id' => $chatId,
                'message_id' => $messageId,
                'body_preview' => $bodyPreview,
                'attachment_count' => $attachmentCount,
            ])
            ->log('Chat message deleted');
    }
}
