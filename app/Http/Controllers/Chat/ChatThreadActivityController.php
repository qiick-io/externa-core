<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\UpdateChatNotifyRequest;
use App\Models\Chat;
use App\Models\User;
use App\Services\Chat\ChatMentionService;
use App\Services\Chat\ChatNotificationService;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The viewer's activity in a thread keyed by Chat UUID: mention options,
 * notification preference, read marker and leaving the thread view.
 */
class ChatThreadActivityController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private ChatMentionService $mentionOptions,
        private ChatNotificationService $notifications,
    ) {}

    public function mentions(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        return response()->json($this->mentionOptions->options($request, $chat, trim((string) $request->query('q', ''))));
    }

    public function updateNotify(UpdateChatNotifyRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();
        $this->notifications->setNotifyForCollection($user, (int) $chat->collection_id, (bool) $validated['notify']);

        return response()->json(['notify' => $validated['notify']]);
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
}
