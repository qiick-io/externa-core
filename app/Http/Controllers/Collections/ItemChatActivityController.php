<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\UpdateChatNotifyRequest;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Chat\ChatMentionService;
use App\Services\Chat\ChatNotificationService;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use App\Traits\ResolvesItemChatTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Item-form chat alias for the viewer's activity in the item thread: mention
 * options, notification preference, read marker and leaving the thread view.
 */
class ItemChatActivityController extends Controller
{
    use ResolvesItemChatTrait;

    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private ChatMentionService $mentionOptions,
        private ChatNotificationService $notifications,
    ) {}

    public function mentions(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);
        $this->chats->assertAccessible($request, $chat);

        return response()->json($this->mentionOptions->options($request, $chat, trim((string) $request->query('q', ''))));
    }

    public function updateNotify(UpdateChatNotifyRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $this->notifications->setNotifyForCollection($user, (int) $collection->id, (bool) $validated['notify']);

        return response()->json(['notify' => $validated['notify']]);
    }

    public function markRead(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        if ($chat instanceof Chat) {
            $this->chats->assertAccessible($request, $chat);
            $this->unread->markRead($chat, $user);
            $this->unread->broadcast($user, $chat);
        }

        return response()->json($this->unread->shared($user));
    }

    public function stopViewing(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);

        if ($chat instanceof Chat) {
            $user = $request->user();
            abort_unless($user instanceof User, 401);
            $this->chats->assertAccessible($request, $chat);
            $this->unread->forgetViewer($chat, $user);
        }

        return response()->json(['ok' => true]);
    }
}
