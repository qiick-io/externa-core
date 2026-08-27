<?php

namespace App\Http\Controllers\Chat;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use App\Services\Collections\CollectionItemOptionsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Hub JSON: thread list, create item/direct chats, option search.
 */
class ChatHubController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private EffectivePermissionResolver $permissionResolver,
        private CollectionItemOptionsService $itemOptions,
    ) {}

    public function threads(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'tab' => ['nullable', Rule::in(['collection', 'private'])],
            'q' => ['nullable', 'string', 'max:120'],
            'collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $tab = $validated['tab'] ?? 'collection';
        $q = trim((string) ($validated['q'] ?? ''));
        $perPage = min(max((int) ($validated['per_page'] ?? 25), 1), 50);

        $lastMessage = fn ($query) => $query->latest('id')->limit(1)->with([
            'user:id,first_name,last_name,email',
            'attachments',
        ]);

        if ($tab === 'private') {
            $chats = $this->chats->directChatsFor($user)
                ->with(['messages' => $lastMessage])
                ->get();
        } else {
            $query = $this->chats->itemChatsFor($request, $user)
                ->with(['messages' => $lastMessage]);

            if (! empty($validated['collection_id'])) {
                $query->where('collection_id', (int) $validated['collection_id']);
            }

            $chats = $this->chats->filterReadableItemChats($request, $query->get());
        }

        if ($q !== '') {
            $chats = $chats->filter(fn (Chat $chat): bool => $this->chats->matchesQuery($chat, $q, $user))->values();
        }

        $page = max((int) $request->query('page', 1), 1);
        $total = $chats->count();
        $slice = $chats->slice(($page - 1) * $perPage, $perPage)->values();
        $unreads = $this->unread->countsFor($slice, $user);
        $totals = $this->unread->shared($user);

        return response()->json([
            'data' => $slice->map(fn (Chat $chat): array => $this->chats->serializeSummary(
                $chat,
                $user,
                $unreads[(string) $chat->id] ?? 0,
            ))->all(),
            'meta' => [
                'total' => $total,
                'per_page' => $perPage,
                'current_page' => $page,
                'last_page' => max((int) ceil($total / $perPage), 1),
                'can_create_direct' => $this->permissionResolver->hasPermission(
                    $user,
                    PermissionEnum::CanCreateDirectChats->value,
                ),
                'unread_count' => $totals['unread_count'],
                'unread_private' => $totals['unread_private'],
                'unread_collection' => $totals['unread_collection'],
            ],
        ]);
    }

    public function unread(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($this->unread->shared($user));
    }

    public function markRead(Request $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $this->chats->assertAccessible($request, $chat);
        $this->unread->markRead($chat, $user);
        $this->unread->broadcast($user, $chat);

        return response()->json($this->unread->shared($user));
    }

    public function stopViewing(Request $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $this->chats->assertAccessible($request, $chat);
        $this->unread->forgetViewer($chat, $user);

        return response()->json(['ok' => true]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'kind' => ['required', Rule::in([Chat::KIND_ITEM, Chat::KIND_DIRECT])],
            'collection_id' => ['required_if:kind,item', 'nullable', 'integer', 'exists:collections,id'],
            'item_id' => ['required_if:kind,item', 'nullable', 'integer', 'exists:collections_items,id'],
            'user_ids' => ['required_if:kind,direct', 'nullable', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'group_ids' => ['nullable', 'array'],
            'group_ids.*' => ['integer', 'exists:user_groups,id'],
        ]);

        if ($validated['kind'] === Chat::KIND_DIRECT) {
            abort_unless(
                $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateDirectChats->value),
                403,
            );

            $chat = $this->chats->findOrCreateDirectChat(
                $user,
                $validated['user_ids'] ?? [],
                $validated['group_ids'] ?? [],
            );
            $chat->load([
                'participants.user:id,first_name,last_name,email',
                'participants.group:id,name',
            ]);

            // New DM only — peers on /chat need a live sidebar row (no MessageCreated yet).
            if ($chat->wasRecentlyCreated) {
                $this->chats->broadcastThreadUpserted($chat, exceptUserIds: [(int) $user->id]);
            }

            return response()->json(['chat' => $this->chats->serializeSummary($chat, $user)], 201);
        }

        $collection = Collection::query()->findOrFail($validated['collection_id']);
        $item = CollectionItem::query()->findOrFail($validated['item_id']);
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowCollections->value),
            404,
        );
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);

        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);
        $chat->load(['collection:id,name', 'item']);

        return response()->json(['chat' => $this->chats->serializeSummary($chat, $user)], 201);
    }

    public function users(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateDirectChats->value),
            403,
        );

        $q = trim((string) $request->query('q', ''));
        $rows = User::query()
            ->where('is_active', true)
            ->whereKeyNot($user->id)
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.$q.'%';
                $query->where(function ($inner) use ($like): void {
                    $inner->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('first_name')
            ->limit(20)
            ->get(['id', 'first_name', 'last_name', 'email']);

        return response()->json([
            'users' => $rows->map(fn (User $row): array => [
                'id' => $row->id,
                'name' => trim($row->name) !== '' ? $row->name : $row->email,
                'email' => $row->email,
            ])->all(),
        ]);
    }

    public function groups(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateDirectChats->value),
            403,
        );

        $q = trim((string) $request->query('q', ''));
        $rows = UserGroup::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name']);

        return response()->json([
            'groups' => $rows->map(fn (UserGroup $row): array => [
                'id' => $row->id,
                'name' => $row->name,
            ])->all(),
        ]);
    }

    public function collections(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $q = trim((string) $request->query('q', ''));
        $rows = Collection::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->limit(40)
            ->get(['id', 'name']);

        return response()->json([
            'collections' => $rows
                ->filter(fn (Collection $collection): bool => $this->chats->userCanReadCollection($user, $collection))
                ->take(20)
                ->map(fn (Collection $collection): array => [
                    'id' => (int) $collection->id,
                    'name' => $collection->name,
                ])
                ->values()
                ->all(),
        ]);
    }

    public function items(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'collection_id' => ['required', 'integer', 'exists:collections,id'],
            'q' => ['nullable', 'string', 'max:120'],
        ]);

        $collection = Collection::query()->findOrFail($validated['collection_id']);
        abort_unless($this->chats->userCanReadCollection($user, $collection), 404);

        $page = $this->itemOptions->paginateForCollection(
            $collection,
            'title',
            null,
            [],
            trim((string) ($validated['q'] ?? '')) ?: null,
            20,
        );

        $data = [];
        foreach ($page->items() as $row) {
            $item = CollectionItem::query()->find($row['id'] ?? null);
            if (! $item instanceof CollectionItem) {
                continue;
            }
            if (! $this->permissionEnforcer->isItemReadable($request, $collection, $item)) {
                continue;
            }
            $data[] = [
                'id' => (int) $item->id,
                'label' => $row['label'] ?? $this->chats->itemLabel($item),
            ];
        }

        return response()->json(['items' => $data]);
    }

    public function directory(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateDirectChats->value),
            403,
        );

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $q = trim((string) ($validated['q'] ?? ''));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 25);

        $users = User::query()
            ->where('is_active', true)
            ->whereKeyNot($user->id)
            ->when($q !== '', function ($query) use ($q): void {
                $like = '%'.$q.'%';
                $query->where(function ($inner) use ($like): void {
                    $inner->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email'])
            ->map(function (User $row): array {
                $name = trim($row->name) !== '' ? $row->name : $row->email;

                return [
                    'type' => 'user',
                    'id' => (int) $row->id,
                    'name' => $name,
                    'email' => $row->email,
                    'first_name' => (string) $row->first_name,
                    'last_name' => (string) ($row->last_name ?? ''),
                    'sort' => mb_strtolower($name),
                ];
            });

        $groups = UserGroup::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (UserGroup $row): array => [
                'type' => 'group',
                'id' => (int) $row->id,
                'name' => $row->name,
                'sort' => mb_strtolower($row->name),
            ]);

        // ponytail: merge users+groups in memory. Ceiling: large directories; upgrade: SQL UNION + paginate.
        $rows = $users->concat($groups)
            ->sortBy('sort')
            ->values()
            ->map(function (array $row): array {
                unset($row['sort']);

                return $row;
            })
            ->all();

        return response()->json($this->paginateRows($rows, $page, $perPage));
    }

    public function itemPicker(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $q = trim((string) ($validated['q'] ?? ''));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 15);

        // ponytail: scan readable collections then first 100 items each. Ceiling: huge catalogs; upgrade: SQL join + item ACL.
        $groups = [];
        $collections = Collection::query()->orderBy('name')->get(['id', 'name']);

        foreach ($collections as $collection) {
            if (! $this->chats->userCanReadCollection($user, $collection)) {
                continue;
            }

            $nameMatches = $q === '' || mb_stripos($collection->name, $q) !== false;
            $itemSearch = $nameMatches ? null : ($q !== '' ? $q : null);

            $itemPage = $this->itemOptions->paginateForCollection(
                $collection,
                'title',
                null,
                [],
                $itemSearch,
                100,
            );

            $labels = [];
            $ids = [];
            foreach ($itemPage->items() as $row) {
                $id = (int) ($row['id'] ?? 0);
                if ($id < 1) {
                    continue;
                }
                $ids[] = $id;
                $labels[$id] = (string) ($row['label'] ?? '');
            }

            if ($ids === []) {
                continue;
            }

            $models = CollectionItem::query()->whereIn('id', $ids)->get()->keyBy('id');
            $items = [];
            foreach ($ids as $id) {
                $item = $models->get($id);
                if (! $item instanceof CollectionItem) {
                    continue;
                }
                if (! $this->permissionEnforcer->isItemReadable($request, $collection, $item)) {
                    continue;
                }
                $label = $labels[$id] !== '' ? $labels[$id] : $this->chats->itemLabel($item);
                $items[] = [
                    'id' => $id,
                    'label' => $label,
                ];
            }

            if ($items === []) {
                continue;
            }

            $groups[] = [
                'id' => (int) $collection->id,
                'name' => $collection->name,
                'items' => $items,
            ];
        }

        return response()->json($this->paginateRows($groups, $page, $perPage));
    }

    public function addParticipants(Request $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateDirectChats->value),
            403,
        );
        $this->chats->assertAccessible($request, $chat);
        abort_unless($chat->isDirect(), 422);

        $validated = $request->validate([
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'group_ids' => ['nullable', 'array'],
            'group_ids.*' => ['integer', 'exists:user_groups,id'],
        ]);

        $chat = $this->chats->addDirectParticipants(
            $chat,
            $user,
            $validated['user_ids'] ?? [],
            $validated['group_ids'] ?? [],
        );

        return response()->json([
            'chat' => $this->chats->serializeSummary($chat, $user),
        ]);
    }

    public function destroy(Request $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $this->chats->assertAccessible($request, $chat);
        abort_unless($chat->isDirect(), 422);

        $this->chats->leaveDirectChat($chat, $user);

        return response()->json(['ok' => true]);
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, per_page: int, current_page: int, last_page: int, has_more: bool}}
     */
    private function paginateRows(array $rows, int $page, int $perPage): array
    {
        $total = count($rows);
        $last = max((int) ceil($total / max($perPage, 1)), 1);
        $page = min(max($page, 1), $last);
        $slice = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'data' => array_values($slice),
            'meta' => [
                'total' => $total,
                'per_page' => $perPage,
                'current_page' => $page,
                'last_page' => $last,
                'has_more' => $page < $last,
            ],
        ];
    }
}
