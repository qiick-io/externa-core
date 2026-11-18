<?php

declare(strict_types=1);

namespace App\Services\Chat;

use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Notifications\ItemChatNotification;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Support\Str;

/**
 * Chat notifications: who is notified of a new message (mentioned users and
 * the collection's subscribers) and the per-user "notify me" collection list.
 */
class ChatNotificationService
{
    public function __construct(
        private SettingsRepositoryService $settings,
        private ChatUnreadService $unread,
        private ChatMessageSerializerService $serializer,
    ) {}

    /**
     * Send an `ItemChatNotification` to every active mentioned user and, on
     * item chats, every subscriber of the collection, except the author.
     *
     * @param  list<int>  $mentionedIds
     */
    public function notifyRecipients(
        Chat $chat,
        CollectionItemChatMessage $comment,
        User $author,
        array $mentionedIds,
    ): void {
        $subscriberIds = [];
        if ($chat->isItem() && $chat->collection_id !== null) {
            $subscriberIds = $this->unread->subscriberIdsForCollection((int) $chat->collection_id);
        }

        $recipientIds = array_values(array_unique(array_filter(
            array_merge($mentionedIds, $subscriberIds),
            fn (int $id): bool => $id !== (int) $author->id,
        )));

        if ($recipientIds === []) {
            return;
        }

        $excerpt = Str::limit(trim(preg_replace('/@\[(?:user|collection):\d+\]/', '', $comment->body) ?? ''), 180);
        $authorName = $this->serializer->displayName($author);
        $mentionedSet = array_fill_keys($mentionedIds, true);

        $recipients = User::query()
            ->whereIn('id', $recipientIds)
            ->where('is_active', true)
            ->get();

        foreach ($recipients as $recipient) {
            $recipient->notify(new ItemChatNotification(
                chatId: $chat->id,
                collectionId: $chat->collection_id !== null ? (int) $chat->collection_id : null,
                itemId: $chat->collection_item_id !== null ? (int) $chat->collection_item_id : null,
                messageId: (int) $comment->id,
                authorName: $authorName,
                excerpt: $excerpt !== '' ? $excerpt : 'New message',
                mentioned: isset($mentionedSet[(int) $recipient->id]),
            ));
        }
    }

    public function isSubscribed(User $user, int $collectionId): bool
    {
        return in_array($collectionId, $this->unread->subscribedCollectionIds($user), true);
    }

    /**
     * Add the collection to (or remove it from) the user's notify list.
     */
    public function setNotifyForCollection(User $user, int $collectionId, bool $notify): void
    {
        $ids = $this->unread->subscribedCollectionIds($user);

        if ($notify) {
            if (! in_array($collectionId, $ids, true)) {
                $ids[] = $collectionId;
            }
        } else {
            $ids = array_values(array_filter($ids, fn (int $id): bool => $id !== $collectionId));
        }

        $this->settings->set(
            SettingsRepositoryService::SCOPE_USER,
            ChatUnreadService::NOTIFY_GROUP,
            ChatUnreadService::NOTIFY_KEY,
            $ids,
            $user->id,
        );
    }
}
