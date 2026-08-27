<?php

namespace App\Services\Chat;

use App\Enums\CollectionPermissionAction;
use App\Enums\PermissionEnum;
use App\Events\ChatThreadUpserted;
use App\Models\Chat;
use App\Models\ChatParticipant;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Support\Collections\CollectionItemDataAccessor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Validation\ValidationException;

/**
 * Create/list chats and enforce item-vs-direct ACL.
 */
class ChatService
{
    public function __construct(
        private CollectionPermissionEnforcer $permissionEnforcer,
        private CollectionPermissionGuard $permissionGuard,
        private EffectivePermissionResolver $permissionResolver,
        private ChatParticipantSync $participantSync,
        private CollectionItemDataAccessor $itemDataAccessor,
    ) {}

    public function findItemChat(CollectionItem $item): ?Chat
    {
        return Chat::forItem($item);
    }

    public function findOrCreateItemChat(User $user, Collection $collection, CollectionItem $item): Chat
    {
        $existing = Chat::forItem($item);
        if ($existing instanceof Chat) {
            return $existing;
        }

        return Chat::query()->create([
            'kind' => Chat::KIND_ITEM,
            'collection_id' => $collection->id,
            'collection_item_id' => $item->id,
            'created_by_user_id' => $user->id,
        ]);
    }

    /**
     * @param  list<int>  $userIds
     * @param  list<int>  $groupIds
     */
    public function findOrCreateDirectChat(User $creator, array $userIds, array $groupIds): Chat
    {
        $userIds = array_values(array_unique(array_map('intval', $userIds)));
        $groupIds = array_values(array_unique(array_map('intval', $groupIds)));

        if (! in_array((int) $creator->id, $userIds, true)) {
            $userIds[] = (int) $creator->id;
        }

        sort($userIds);
        sort($groupIds);

        if (count($userIds) < 2 && $groupIds === []) {
            throw ValidationException::withMessages([
                'user_ids' => 'Add at least one other person or a group.',
            ]);
        }

        $existing = $this->matchingDirectChat($userIds, $groupIds);
        if ($existing instanceof Chat) {
            return $existing;
        }

        $users = User::query()
            ->whereIn('id', $userIds)
            ->where('is_active', true)
            ->get();

        if ($users->count() !== count($userIds)) {
            throw ValidationException::withMessages([
                'user_ids' => 'One or more users are invalid.',
            ]);
        }

        $groups = UserGroup::query()->whereIn('id', $groupIds)->get();
        if ($groups->count() !== count($groupIds)) {
            throw ValidationException::withMessages([
                'group_ids' => 'One or more groups are invalid.',
            ]);
        }

        $chat = Chat::query()->create([
            'kind' => Chat::KIND_DIRECT,
            'created_by_user_id' => $creator->id,
        ]);

        foreach ($userIds as $userId) {
            ChatParticipant::query()->create([
                'chat_id' => $chat->id,
                'user_id' => $userId,
                'user_group_id' => null,
                'source' => ChatParticipant::SOURCE_EXPLICIT,
            ]);
        }

        foreach ($groups as $group) {
            ChatParticipant::query()->create([
                'chat_id' => $chat->id,
                'user_id' => null,
                'user_group_id' => $group->id,
                'source' => ChatParticipant::SOURCE_EXPLICIT,
            ]);
            $this->participantSync->expandGroup($chat, $group);
        }

        return $chat;
    }

    public function assertAccessible(Request $request, Chat $chat): void
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        if ($chat->isItem()) {
            $collection = $chat->collection;
            $item = $chat->item;
            abort_unless($collection instanceof Collection && $item instanceof CollectionItem, 404);
            abort_unless(
                $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowCollections->value),
                404,
            );
            $this->permissionEnforcer->assertItemReadable($request, $collection, $item);

            return;
        }

        abort_unless($this->isParticipant($chat, $user), 403);
    }

    public function isParticipant(Chat $chat, User $user): bool
    {
        return ChatParticipant::query()
            ->where('chat_id', $chat->id)
            ->where('user_id', $user->id)
            ->exists();
    }

    /**
     * User ids allowed as @mentions in this thread.
     *
     * @return list<int>
     */
    public function mentionableUserIds(Chat $chat): array
    {
        if ($chat->isDirect()) {
            return ChatParticipant::query()
                ->where('chat_id', $chat->id)
                ->whereNotNull('user_id')
                ->pluck('user_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->all();
        }

        return [];
    }

    public function userCanReadCollection(User $user, Collection $collection): bool
    {
        if (! $user->is_active) {
            return false;
        }

        if (! $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return false;
        }

        $roleIds = $this->permissionResolver->effectiveRoleIds($user);
        $hasGrant = false;

        foreach ($roleIds as $roleId) {
            $matrix = $this->permissionGuard->matrixForRole($roleId);
            if (! isset($matrix[(int) $collection->id])) {
                continue;
            }

            $hasGrant = true;
            if ($this->permissionGuard->allows($roleId, (int) $collection->id, CollectionPermissionAction::Read)) {
                return true;
            }
        }

        return ! $hasGrant;
    }

    /**
     * @return Builder<Chat>
     */
    public function itemChatsFor(Request $request, User $user): Builder
    {
        return Chat::query()
            ->where('kind', Chat::KIND_ITEM)
            ->whereHas('collection')
            ->whereHas('item')
            ->with(['collection:id,name,icon,color', 'item'])
            ->orderByDesc('updated_at');
    }

    /**
     * @return Builder<Chat>
     */
    public function directChatsFor(User $user): Builder
    {
        return Chat::query()
            ->where('kind', Chat::KIND_DIRECT)
            ->whereHas('participants', fn (Builder $query) => $query->where('user_id', $user->id))
            ->with([
                'participants.user:id,first_name,last_name,email',
                'participants.group:id,name',
            ])
            ->orderByDesc('updated_at');
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeSummary(Chat $chat, User $viewer, int $unreadCount = 0): array
    {
        $last = $chat->relationLoaded('messages')
            ? $chat->messages->first()
            : $chat->messages()->with([
                'user:id,first_name,last_name,email',
                'attachments',
            ])->latest('id')->first();

        if ($last instanceof CollectionItemChatMessage && ! $last->relationLoaded('attachments')) {
            $last->load('attachments');
        }

        $snippet = $last instanceof CollectionItemChatMessage
            ? mb_substr(trim(preg_replace('/@\[(?:user|collection):\d+\]/', '', $last->body) ?? ''), 0, 80)
            : '';

        $image = $last instanceof CollectionItemChatMessage
            ? $last->attachments->first(
                fn ($attachment): bool => str_starts_with(strtolower((string) $attachment->mime_type), 'image/'),
            )
            : null;

        $title = $this->titleFor($chat, $viewer);

        return [
            'id' => $chat->id,
            'kind' => $chat->kind,
            'title' => $title,
            'collection_id' => $chat->collection_id !== null ? (int) $chat->collection_id : null,
            'collection_item_id' => $chat->collection_item_id !== null ? (int) $chat->collection_item_id : null,
            'collection_name' => $chat->collection?->name,
            'collection_icon' => $chat->isItem() ? ($chat->collection?->icon) : null,
            'collection_color' => $chat->isItem() ? ($chat->collection?->color) : null,
            'item_label' => $chat->isItem() && $chat->item instanceof CollectionItem
                ? $this->itemLabel($chat->item)
                : null,
            'participants' => $chat->isDirect() ? $this->serializeParticipants($chat) : [],
            'last_message' => $last instanceof CollectionItemChatMessage
                ? [
                    'id' => $last->id,
                    'body' => $snippet,
                    'user_name' => $last->user?->name,
                    'created_at' => $last->created_at?->toIso8601String(),
                    'image_attachment_id' => $image instanceof CollectionItemChatAttachment
                        ? $image->id
                        : null,
                ]
                : null,
            'unread_count' => $unreadCount,
            'updated_at' => $chat->updated_at?->toIso8601String(),
        ];
    }

    public function itemLabel(CollectionItem $item): string
    {
        $title = $this->itemDataAccessor->getTranslated($item, 'title');
        if (is_string($title) && trim($title) !== '') {
            return trim($title);
        }

        $assembled = app(CollectionItemValuesAssembler::class)->assemble($item);
        foreach (['name', 'label', 'heading'] as $field) {
            $value = $assembled[$field] ?? null;
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return '#'.$item->id;
    }

    public function titleFor(Chat $chat, User $viewer): string
    {
        if ($chat->isItem()) {
            $collection = $chat->collection?->name ?? 'Collection';
            $item = $chat->item instanceof CollectionItem ? $this->itemLabel($chat->item) : '';

            return $item !== '' ? $collection.' · '.$item : $collection;
        }

        $names = $chat->participants
            ->filter(fn (ChatParticipant $row): bool => $row->user_id !== null)
            ->map(fn (ChatParticipant $row): ?User => $row->user)
            ->filter(fn (?User $user): bool => $user instanceof User && (int) $user->id !== (int) $viewer->id)
            ->map(fn (User $user): string => trim($user->name) !== '' ? $user->name : $user->email)
            ->unique()
            ->values();

        $groupNames = $chat->participants
            ->filter(fn (ChatParticipant $row): bool => $row->user_group_id !== null)
            ->map(fn (ChatParticipant $row): string => $row->group?->name ?? '')
            ->filter(fn (string $name): bool => $name !== '')
            ->unique()
            ->values();

        $parts = $names->merge($groupNames)->filter()->values();

        return $parts->isEmpty() ? 'Chat' : $parts->implode(', ');
    }

    /**
     * @return list<array{type: string, id: int, name: string}>
     */
    public function serializeParticipants(Chat $chat): array
    {
        $out = [];

        foreach ($chat->participants as $row) {
            if ($row->user_id !== null && $row->user instanceof User) {
                $name = trim($row->user->name);

                $out[] = [
                    'type' => 'user',
                    'id' => (int) $row->user->id,
                    'name' => $name !== '' ? $name : $row->user->email,
                ];
            }

            if ($row->user_group_id !== null && $row->group instanceof UserGroup) {
                $out[] = [
                    'type' => 'group',
                    'id' => (int) $row->group->id,
                    'name' => $row->group->name,
                ];
            }
        }

        return $out;
    }

    public function matchesQuery(Chat $chat, string $q, User $viewer): bool
    {
        $needle = mb_strtolower($q);
        $hay = mb_strtolower($this->titleFor($chat, $viewer));
        if (str_contains($hay, $needle)) {
            return true;
        }

        if ($chat->isItem() && str_contains(mb_strtolower((string) $chat->collection?->name), $needle)) {
            return true;
        }

        $last = $chat->relationLoaded('messages')
            ? $chat->messages->first()?->body
            : $chat->messages()->latest('id')->value('body');
        if (is_string($last) && str_contains(mb_strtolower($last), $needle)) {
            return true;
        }

        if ($chat->isDirect()) {
            foreach ($this->serializeParticipants($chat) as $participant) {
                if (str_contains(mb_strtolower($participant['name']), $needle)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Filter item chats the current user can actually read.
     *
     * ponytail: O(n) readability scan; upgrade to SQL when chat counts grow.
     *
     * @param  SupportCollection<int, Chat>  $chats
     * @return SupportCollection<int, Chat>
     */
    public function filterReadableItemChats(Request $request, SupportCollection $chats): SupportCollection
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return collect();
        }

        return $chats->filter(function (Chat $chat) use ($request, $user): bool {
            $collection = $chat->collection;
            $item = $chat->item;
            if (! $collection instanceof Collection || ! $item instanceof CollectionItem) {
                return false;
            }

            if (! $this->userCanReadCollection($user, $collection)) {
                return false;
            }

            return $this->permissionEnforcer->isItemReadable($request, $collection, $item);
        })->values();
    }

    /**
     * @param  list<int>  $userIds
     * @param  list<int>  $groupIds
     */
    public function addDirectParticipants(Chat $chat, User $actor, array $userIds, array $groupIds): Chat
    {
        abort_unless($chat->isDirect(), 422);
        abort_unless($this->isParticipant($chat, $actor), 403);

        $userIds = array_values(array_unique(array_map('intval', $userIds)));
        $groupIds = array_values(array_unique(array_map('intval', $groupIds)));

        $existingUserIds = $chat->participants()
            ->whereNotNull('user_id')
            ->pluck('user_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();
        $existingGroupIds = $chat->participants()
            ->whereNotNull('user_group_id')
            ->pluck('user_group_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();

        $userIds = array_values(array_diff($userIds, $existingUserIds));
        $groupIds = array_values(array_diff($groupIds, $existingGroupIds));

        if ($userIds === [] && $groupIds === []) {
            return $chat;
        }

        $users = User::query()
            ->whereIn('id', $userIds)
            ->where('is_active', true)
            ->get();

        if ($users->count() !== count($userIds)) {
            throw ValidationException::withMessages([
                'user_ids' => 'One or more users are invalid.',
            ]);
        }

        $groups = UserGroup::query()->whereIn('id', $groupIds)->get();
        if ($groups->count() !== count($groupIds)) {
            throw ValidationException::withMessages([
                'group_ids' => 'One or more groups are invalid.',
            ]);
        }

        foreach ($userIds as $userId) {
            ChatParticipant::query()->create([
                'chat_id' => $chat->id,
                'user_id' => $userId,
                'user_group_id' => null,
                'source' => ChatParticipant::SOURCE_EXPLICIT,
            ]);
        }

        foreach ($groups as $group) {
            ChatParticipant::query()->create([
                'chat_id' => $chat->id,
                'user_id' => null,
                'user_group_id' => $group->id,
                'source' => ChatParticipant::SOURCE_EXPLICIT,
            ]);
            $this->participantSync->expandGroup($chat, $group);
        }

        $chat->load([
            'participants.user:id,first_name,last_name,email',
            'participants.group:id,name',
        ]);

        return $chat;
    }

    public function leaveDirectChat(Chat $chat, User $user): void
    {
        abort_unless($chat->isDirect(), 422);
        abort_unless($this->isParticipant($chat, $user), 403);

        ChatParticipant::query()
            ->where('chat_id', $chat->id)
            ->where('user_id', $user->id)
            ->delete();

        $remaining = ChatParticipant::query()
            ->where('chat_id', $chat->id)
            ->whereNotNull('user_id')
            ->distinct()
            ->count('user_id');

        if ($remaining === 0) {
            $chat->delete();
        }
    }

    /**
     * Push a viewer-specific thread summary to each participant's private channel.
     *
     * @param  array<int, int>  $unreadByUserId  chat unread counts keyed by user id
     * @param  list<int>  $exceptUserIds
     */
    public function broadcastThreadUpserted(
        Chat $chat,
        array $unreadByUserId = [],
        array $exceptUserIds = [],
    ): void {
        if (! $chat->isDirect()) {
            return;
        }

        $chat->loadMissing([
            'participants.user:id,first_name,last_name,email',
            'participants.group:id,name',
            'messages' => fn ($query) => $query->latest('id')->limit(1)->with([
                'user:id,first_name,last_name,email',
                'attachments',
            ]),
        ]);

        $except = array_fill_keys(array_map('intval', $exceptUserIds), true);
        $userIds = ChatParticipant::query()
            ->where('chat_id', $chat->id)
            ->whereNotNull('user_id')
            ->pluck('user_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->unique()
            ->reject(fn (int $id): bool => isset($except[$id]))
            ->values()
            ->all();

        if ($userIds === []) {
            return;
        }

        $users = User::query()
            ->whereIn('id', $userIds)
            ->where('is_active', true)
            ->get();

        foreach ($users as $user) {
            $uid = (int) $user->id;
            event(new ChatThreadUpserted(
                $uid,
                $this->serializeSummary($chat, $user, $unreadByUserId[$uid] ?? 0),
            ));
        }
    }

    /**
     * @param  list<int>  $userIds
     * @param  list<int>  $groupIds
     */
    private function matchingDirectChat(array $userIds, array $groupIds): ?Chat
    {
        $candidates = Chat::query()
            ->where('kind', Chat::KIND_DIRECT)
            ->whereHas('participants', fn (Builder $query) => $query->where('user_id', $userIds[0] ?? 0))
            ->with('participants')
            ->get();

        foreach ($candidates as $chat) {
            $existingUsers = $chat->participants
                ->filter(fn (ChatParticipant $row): bool => $row->user_id !== null && $row->source === ChatParticipant::SOURCE_EXPLICIT)
                ->pluck('user_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->sort()
                ->values()
                ->all();
            $existingGroups = $chat->participants
                ->filter(fn (ChatParticipant $row): bool => $row->user_group_id !== null)
                ->pluck('user_group_id')
                ->map(fn (mixed $id): int => (int) $id)
                ->sort()
                ->values()
                ->all();

            if ($existingUsers === $userIds && $existingGroups === $groupIds) {
                return $chat;
            }
        }

        return null;
    }
}
