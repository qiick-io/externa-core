<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ListChatThreadsRequest;
use App\Http\Requests\Chat\StoreChatThreadRequest;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Hub JSON: thread list, unread totals, create item/direct chats. Option
 * searches live in `ChatRecipientOptionController` / `ChatItemOptionController`,
 * direct-chat management in `ChatDirectThreadController`.
 */
class ChatHubController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
    ) {}

    public function threads(ListChatThreadsRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $tab = $validated['tab'] ?? 'collection';
        $q = trim((string) ($validated['q'] ?? ''));
        $archived = $tab === 'private' && $request->boolean('archived');
        $perPage = min(max((int) ($validated['per_page'] ?? 25), 1), 50);

        $lastMessage = fn ($query) => $query->latest('id')->limit(1)->with([
            'user:id,first_name,last_name,email',
            'attachments',
        ]);

        $page = max((int) $request->query('page', 1), 1);

        if ($tab === 'private') {
            $query = $this->chats->directChatsFor($user, $archived)
                ->with([
                    'messages' => $lastMessage,
                    'participants.user:id,first_name,last_name,email',
                    'participants.group:id,name',
                ]);

            if ($q !== '') {
                $query = $this->chats->applyHubSearch($query, $q, $user);
            }

            $paginator = $query->paginate($perPage, ['*'], 'page', $page);
            $slice = $paginator->getCollection()->values();
            $total = $paginator->total();
        } else {
            $query = $this->chats->itemChatsFor($request, $user)
                ->with(['messages' => $lastMessage]);

            if (! empty($validated['collection_id'])) {
                $query->where('collection_id', (int) $validated['collection_id']);
            }

            if ($q !== '') {
                $query = $this->chats->applyHubSearch($query, $q, $user);
            }

            // Item-level ACL still needs PHP filter. Over-fetch then page in memory for this set.
            // Collection scope + search already ran in SQL (readableCollectionScope / applyHubSearch).
            $candidates = $this->chats->filterReadableItemChats($request, $query->get());
            $total = $candidates->count();
            $slice = $candidates->slice(($page - 1) * $perPage, $perPage)->values();
        }

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
                'can_create_direct' => Gate::forUser($user)->allows('createDirect', Chat::class),
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

    public function store(StoreChatThreadRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        if ($validated['kind'] === Chat::KIND_DIRECT) {
            abort_unless(Gate::forUser($user)->allows('createDirect', Chat::class), 403);

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
        abort_unless(Gate::forUser($user)->allows('createForItem', [Chat::class, $collection, $item]), 404);

        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);
        $chat->load(['collection:id,name', 'item']);

        return response()->json(['chat' => $this->chats->serializeSummary($chat, $user)], 201);
    }
}
