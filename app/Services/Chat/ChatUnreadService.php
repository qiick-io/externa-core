<?php

namespace App\Services\Chat;

use App\Events\ChatUnreadUpdated;
use App\Models\Chat;
use App\Models\ChatParticipant;
use App\Models\ChatRead;
use App\Models\CollectionItemChatMessage;
use App\Models\Setting;
use App\Models\User;
use App\Services\Settings\SettingsRepository;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\Cache;

/**
 * Compute per-user chat unread from messages after last_read, with collection policy.
 */
class ChatUnreadService
{
    public const NOTIFY_GROUP = 'item_chat';

    public const NOTIFY_KEY = 'notify';

    private const VIEWING_TTL_SECONDS = 120;

    public function __construct(
        private SettingsRepository $settings,
        private ChatService $chats,
    ) {}

    /**
     * @return array{unread_count: int, unread_private: int, unread_collection: int}
     */
    public function shared(User $user): array
    {
        $totals = $this->totals($user);

        return [
            'unread_count' => $totals['total'],
            'unread_private' => $totals['private'],
            'unread_collection' => $totals['collection'],
        ];
    }

    /**
     * @return array{total: int, private: int, collection: int}
     */
    public function totals(User $user): array
    {
        $private = $this->privateUnreadTotal($user);
        $collection = $this->collectionUnreadTotal($user);

        return [
            'total' => $private + $collection,
            'private' => $private,
            'collection' => $collection,
        ];
    }

    public function markRead(Chat $chat, User $user, bool $viewing = true): void
    {
        $maxId = (int) (CollectionItemChatMessage::query()
            ->where('chat_id', $chat->id)
            ->max('id') ?? 0);

        ChatRead::query()->updateOrCreate(
            [
                'chat_id' => $chat->id,
                'user_id' => $user->id,
            ],
            [
                'last_read_message_id' => $maxId,
                'last_read_at' => now(),
            ],
        );

        if ($viewing) {
            $this->rememberViewer($chat, $user);
        }
    }

    /**
     * @return list<int>
     */
    public function viewerIds(Chat $chat): array
    {
        $viewers = Cache::get($this->viewerCacheKey($chat), []);
        if (! is_array($viewers)) {
            return [];
        }

        $cutoff = now()->subSeconds(self::VIEWING_TTL_SECONDS)->getTimestamp();
        $ids = [];

        foreach ($viewers as $userId => $timestamp) {
            if ((int) $timestamp >= $cutoff) {
                $ids[] = (int) $userId;
            }
        }

        return $ids;
    }

    /**
     * Mark author + current viewers read, then broadcast totals to anyone whose unread may change.
     *
     * ponytail: totals() per recipient. Ceiling: busy collection notify; upgrade: stored unread counter.
     */
    public function afterMessageCreated(
        Chat $chat,
        CollectionItemChatMessage $message,
        User $author,
        array $mentionedIds,
    ): void {
        $viewerIds = $this->viewerIds($chat);
        $this->markRead($chat, $author, viewing: false);

        $viewers = User::query()->whereIn('id', $viewerIds)->get()->keyBy('id');
        foreach ($viewerIds as $viewerId) {
            $viewer = $viewers->get($viewerId);
            if ($viewer instanceof User) {
                $this->markRead($chat, $viewer, viewing: true);
            }
        }

        $recipientIds = $this->recipientIds($chat, $message, $author, $mentionedIds);
        $authorId = (int) $author->id;
        $soundIds = array_values(array_unique(array_filter(
            array_merge($recipientIds, $viewerIds),
            fn (int $id): bool => $id !== $authorId,
        )));
        $touched = array_values(array_unique(array_merge(
            $recipientIds,
            $viewerIds,
            [$authorId],
        )));

        $users = User::query()->whereIn('id', $touched)->where('is_active', true)->get();
        $unreadByUserId = [];

        foreach ($users as $user) {
            $counts = $this->countsFor(collect([$chat]), $user);
            $chatUnread = $counts[(string) $chat->id] ?? 0;
            $unreadByUserId[(int) $user->id] = $chatUnread;
            $this->broadcast(
                $user,
                $chat,
                playSound: in_array((int) $user->id, $soundIds, true),
                chatUnreadCount: $chatUnread,
            );
        }

        // Peer may never have joined presence chat.* — upsert hub row + last_message preview.
        if ($chat->isDirect()) {
            $this->chats->broadcastThreadUpserted($chat, $unreadByUserId);
        }
    }

    public function broadcast(
        User $user,
        ?Chat $chat = null,
        bool $playSound = false,
        ?int $chatUnreadCount = null,
    ): void {
        $totals = $this->totals($user);
        $chatId = $chat !== null ? (string) $chat->id : null;
        $chatUnread = $chatUnreadCount;

        if ($chat !== null && $chatUnread === null) {
            $counts = $this->countsFor(collect([$chat]), $user);
            $chatUnread = $counts[$chatId] ?? 0;
        }

        event(new ChatUnreadUpdated(
            (int) $user->id,
            $totals['total'],
            $totals['private'],
            $totals['collection'],
            $chatId,
            $chatUnread,
            $playSound,
        ));
    }

    public function forgetViewer(Chat $chat, User $user): void
    {
        $key = $this->viewerCacheKey($chat);
        $viewers = Cache::get($key, []);
        if (! is_array($viewers)) {
            return;
        }

        unset($viewers[(int) $user->id]);

        if ($viewers === []) {
            Cache::forget($key);

            return;
        }

        Cache::put($key, $viewers, now()->addSeconds(self::VIEWING_TTL_SECONDS));
    }

    /**
     * @param  SupportCollection<int, Chat>  $chats
     * @return array<string, int>
     */
    public function countsFor(SupportCollection $chats, User $user): array
    {
        $ids = $chats->pluck('id')->map(fn (mixed $id): string => (string) $id)->all();
        if ($ids === []) {
            return [];
        }

        $counts = array_fill_keys($ids, 0);

        $directIds = $chats
            ->filter(fn (Chat $chat): bool => $chat->isDirect())
            ->pluck('id')
            ->all();
        $itemIds = $chats
            ->filter(fn (Chat $chat): bool => $chat->isItem())
            ->pluck('id')
            ->all();

        if ($directIds !== []) {
            foreach ($this->groupedUnread($this->directUnreadQuery($user)->whereIn('chat_messages.chat_id', $directIds)) as $chatId => $unread) {
                $counts[(string) $chatId] = $unread;
            }
        }

        if ($itemIds !== []) {
            foreach ($this->groupedUnread($this->collectionUnreadQuery($user)->whereIn('chat_messages.chat_id', $itemIds)) as $chatId => $unread) {
                $counts[(string) $chatId] = $unread;
            }
        }

        return $counts;
    }

    /**
     * User ids that should see this message as unread (policy, excluding author).
     *
     * @param  list<int>  $mentionedIds
     * @return list<int>
     */
    public function recipientIds(
        Chat $chat,
        CollectionItemChatMessage $message,
        User $author,
        array $mentionedIds,
    ): array {
        $authorId = (int) $author->id;

        if ($chat->isDirect()) {
            return ChatParticipant::query()
                ->where('chat_id', $chat->id)
                ->whereNotNull('user_id')
                ->pluck('user_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->reject(fn (int $id): bool => $id === $authorId)
                ->values()
                ->all();
        }

        $ids = $mentionedIds;
        if ($chat->collection_id !== null) {
            $ids = array_merge($ids, $this->subscriberIdsForCollection((int) $chat->collection_id));
        }

        $ids = array_merge(
            $ids,
            CollectionItemChatMessage::query()
                ->where('chat_id', $chat->id)
                ->where('user_id', '!=', $authorId)
                ->distinct()
                ->pluck('user_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->all(),
        );

        return array_values(array_unique(array_filter(
            $ids,
            fn (int $id): bool => $id !== $authorId,
        )));
    }

    /**
     * @return list<int>
     */
    public function subscribedCollectionIds(User $user): array
    {
        $value = $this->settings->get(
            SettingsRepository::SCOPE_USER,
            self::NOTIFY_GROUP,
            self::NOTIFY_KEY,
            $user->id,
            [],
        );

        if (! is_array($value)) {
            return [];
        }

        return array_values(array_unique(array_map('intval', $value)));
    }

    private function rememberViewer(Chat $chat, User $user): void
    {
        $key = $this->viewerCacheKey($chat);
        $viewers = Cache::get($key, []);
        if (! is_array($viewers)) {
            $viewers = [];
        }

        $viewers[(int) $user->id] = now()->getTimestamp();
        Cache::put($key, $viewers, now()->addSeconds(self::VIEWING_TTL_SECONDS));
    }

    private function viewerCacheKey(Chat $chat): string
    {
        return 'chat.viewers.'.$chat->id;
    }

    private function privateUnreadTotal(User $user): int
    {
        return $this->directUnreadQuery($user)->count();
    }

    private function collectionUnreadTotal(User $user): int
    {
        return $this->collectionUnreadQuery($user)->count();
    }

    /**
     * @return Builder<CollectionItemChatMessage>
     */
    private function directUnreadQuery(User $user): Builder
    {
        return CollectionItemChatMessage::query()
            ->join('chats', 'chats.id', '=', 'chat_messages.chat_id')
            ->join('chat_participants', function ($join) use ($user): void {
                $join->on('chat_participants.chat_id', '=', 'chats.id')
                    ->where('chat_participants.user_id', $user->id);
            })
            ->leftJoin('chat_reads', function ($join) use ($user): void {
                $join->on('chat_reads.chat_id', '=', 'chats.id')
                    ->where('chat_reads.user_id', $user->id);
            })
            ->where('chats.kind', Chat::KIND_DIRECT)
            ->whereNull('chats.deleted_at')
            ->where('chat_messages.user_id', '!=', $user->id)
            ->where($this->afterLastRead());
    }

    /**
     * Unread item-chat messages: mention, collection notify, or already posted in the thread.
     *
     * @return Builder<CollectionItemChatMessage>
     */
    private function collectionUnreadQuery(User $user): Builder
    {
        $notifyIds = $this->subscribedCollectionIds($user);

        return CollectionItemChatMessage::query()
            ->join('chats', 'chats.id', '=', 'chat_messages.chat_id')
            ->leftJoin('chat_reads', function ($join) use ($user): void {
                $join->on('chat_reads.chat_id', '=', 'chats.id')
                    ->where('chat_reads.user_id', $user->id);
            })
            ->where('chats.kind', Chat::KIND_ITEM)
            ->whereNull('chats.deleted_at')
            ->where('chat_messages.user_id', '!=', $user->id)
            ->where($this->afterLastRead())
            ->where(function ($query) use ($user, $notifyIds): void {
                $query->whereJsonContains('chat_messages.mentioned_user_ids', $user->id);
                if ($notifyIds !== []) {
                    $query->orWhereIn('chats.collection_id', $notifyIds);
                }
                $query->orWhereExists(function ($posted) use ($user): void {
                    $posted->selectRaw('1')
                        ->from('chat_messages as posted')
                        ->whereColumn('posted.chat_id', 'chats.id')
                        ->where('posted.user_id', $user->id)
                        ->whereNull('posted.deleted_at');
                });
            });
    }

    /**
     * @return \Closure(Builder<CollectionItemChatMessage>): void
     */
    private function afterLastRead(): \Closure
    {
        return function ($query): void {
            $query->whereNull('chat_reads.last_read_message_id')
                ->orWhereColumn('chat_messages.id', '>', 'chat_reads.last_read_message_id');
        };
    }

    /**
     * @param  Builder<CollectionItemChatMessage>  $query
     * @return array<string, int>
     */
    private function groupedUnread(Builder $query): array
    {
        $rows = $query
            ->clone()
            ->select('chat_messages.chat_id')
            ->selectRaw('COUNT(*) as unread')
            ->groupBy('chat_messages.chat_id')
            ->toBase()
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row->chat_id] = (int) $row->unread;
        }

        return $out;
    }

    /**
     * @return list<int>
     */
    private function subscriberIdsForCollection(int $collectionId): array
    {
        $ids = [];
        $rows = Setting::query()
            ->where('scope', SettingsRepository::SCOPE_USER)
            ->where('group', self::NOTIFY_GROUP)
            ->where('key', self::NOTIFY_KEY)
            ->whereNotNull('scope_id')
            ->get(['scope_id', 'value']);

        foreach ($rows as $row) {
            $value = is_array($row->value) ? array_map('intval', $row->value) : [];
            if (in_array($collectionId, $value, true)) {
                $ids[] = (int) $row->scope_id;
            }
        }

        return $ids;
    }
}
