<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Actions\Chat\DeleteChatMessageAction;
use App\Actions\Chat\PinChatMessageAction;
use App\Actions\Chat\SendChatMessageAction;
use App\Actions\Chat\UpdateChatMessageAction;
use App\Data\Chat\SendChatMessageData;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ListChatMessagesRequest;
use App\Http\Requests\Chat\PinChatMessageRequest;
use App\Http\Requests\Chat\StoreChatMessageRequest;
use App\Http\Requests\Chat\UpdateChatMessageRequest;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Chat\ChatMessageFeedService;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * JSON chat API keyed by unified Chat UUID: the messages of a thread.
 * Attachments, uploads, reactions and the viewer's activity live in the
 * sibling `Chat*Controller` classes.
 */
class ChatMessageController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatMessageFeedService $feed,
    ) {}

    public function index(ListChatMessagesRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($this->feed->page($chat, $user, $request->validated()));
    }

    public function store(StoreChatMessageRequest $request, Chat $chat, SendChatMessageAction $sendChatMessage): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $payload = $sendChatMessage->execute(SendChatMessageData::fromValidated($chat, $user, $request->validated()));

        return response()->json(['message' => $payload], 201);
    }

    public function update(
        UpdateChatMessageRequest $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        UpdateChatMessageAction $updateChatMessage,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();
        $payload = $updateChatMessage->execute($chat, $message, $user, (string) $validated['body'], $validated['mentioned_user_ids'] ?? null);

        return response()->json(['message' => $payload]);
    }

    public function destroy(
        Request $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        DeleteChatMessageAction $deleteChatMessage,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        abort_unless((string) $message->chat_id === (string) $chat->id, 404);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(Gate::forUser($user)->allows('delete', $message), 403);

        $deleteChatMessage->execute($chat, $message, $user);

        return response()->json(['ok' => true]);
    }

    public function pin(
        PinChatMessageRequest $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        PinChatMessageAction $pinChatMessage,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $payload = $pinChatMessage->execute($chat, $message, $user, (bool) $request->validated()['pinned']);

        return response()->json(['message' => $payload]);
    }
}
