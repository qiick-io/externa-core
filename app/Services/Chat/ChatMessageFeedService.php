<?php

declare(strict_types=1);

namespace App\Services\Chat;

use App\Http\Requests\Chat\ListChatMessagesRequest;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;

/**
 * A thread's message feed: one page of messages (newest last, paged backwards
 * with `before_id`), the pinned messages and the thread meta.
 */
class ChatMessageFeedService
{
    public function __construct(
        private ChatMessageSerializerService $serializer,
        private ChatNotificationService $notifications,
    ) {}

    /**
     * @param  array<string, mixed>  $validated  `ListChatMessagesRequest::validated()`
     * @return array{messages: list<array<string, mixed>>, pinned: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function page(Chat $chat, User $viewer, array $validated): array
    {
        $perPage = $this->perPage($validated);
        $beforeId = isset($validated['before_id']) ? (int) $validated['before_id'] : null;

        $query = CollectionItemChatMessage::query()
            ->where('chat_id', $chat->id)
            ->with($this->serializer->messageRelations())
            ->orderByDesc('id');

        if ($beforeId !== null) {
            $query->where('id', '<', $beforeId);
        }

        $page = $query->limit($perPage + 1)->get();
        $hasMore = $page->count() > $perPage;
        $messages = $page->take($perPage)->reverse()->values();

        $pinned = CollectionItemChatMessage::query()
            ->where('chat_id', $chat->id)
            ->whereNotNull('pinned_at')
            ->with(['user:id,first_name,last_name,email', 'user.roles:id,name'])
            ->orderByDesc('pinned_at')
            ->get();

        $collectionId = $chat->collection_id !== null ? (int) $chat->collection_id : null;

        return [
            'messages' => $messages
                ->map(fn (CollectionItemChatMessage $message): array => $this->serializer->serializeMessage($message, $viewer))
                ->values()
                ->all(),
            'pinned' => $pinned
                ->map(fn (CollectionItemChatMessage $message): array => $this->serializer->serializePinned($message))
                ->values()
                ->all(),
            'meta' => [
                'total' => CollectionItemChatMessage::query()->where('chat_id', $chat->id)->count(),
                'has_more' => $hasMore,
                'per_page' => $perPage,
                'notify' => $collectionId !== null ? $this->notifications->isSubscribed($viewer, $collectionId) : false,
                'chat_id' => $chat->id,
                'kind' => $chat->kind,
                'visibility_hint' => $chat->isItem(),
            ],
        ];
    }

    /**
     * The feed of an item that has no thread yet (the item-form alias
     * creates it on the first message).
     *
     * @param  array<string, mixed>  $validated  `ListChatMessagesRequest::validated()`
     * @return array{messages: list<never>, pinned: list<never>, meta: array<string, mixed>}
     */
    public function emptyPage(int $collectionId, User $viewer, array $validated): array
    {
        return [
            'messages' => [],
            'pinned' => [],
            'meta' => [
                'total' => 0,
                'has_more' => false,
                'per_page' => $this->perPage($validated),
                'notify' => $this->notifications->isSubscribed($viewer, $collectionId),
                'chat_id' => null,
                'kind' => Chat::KIND_ITEM,
                'visibility_hint' => true,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function perPage(array $validated): int
    {
        return min(
            max((int) ($validated['per_page'] ?? ListChatMessagesRequest::DEFAULT_PER_PAGE), 1),
            ListChatMessagesRequest::MAX_PER_PAGE,
        );
    }
}
