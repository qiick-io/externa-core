<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\AddChatParticipantsRequest;
use App\Models\Chat;
use App\Models\User;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Direct-chat membership keyed by Chat UUID: add participants, leave,
 * archive and unarchive.
 */
class ChatDirectThreadController extends Controller
{
    public function __construct(
        private ChatService $chats,
    ) {}

    public function addParticipants(AddChatParticipantsRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

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

    public function archive(Request $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $this->chats->assertAccessible($request, $chat);
        abort_unless($chat->isDirect(), 422);

        $this->chats->archiveDirectChat($chat, $user);

        return response()->json(['ok' => true]);
    }

    public function unarchive(Request $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $this->chats->assertAccessible($request, $chat);
        abort_unless($chat->isDirect(), 422);

        $this->chats->unarchiveDirectChat($chat, $user);

        $chat->load([
            'participants.user:id,first_name,last_name,email',
            'participants.group:id,name',
        ]);

        return response()->json([
            'chat' => $this->chats->serializeSummary($chat, $user),
        ]);
    }
}
