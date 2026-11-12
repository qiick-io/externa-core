<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Actions\Chat\ToggleChatReactionAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ReactToChatMessageRequest;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Emoji reactions on a chat message, keyed by Chat UUID.
 */
class ChatMessageReactionController extends Controller
{
    public function react(
        ReactToChatMessageRequest $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        ToggleChatReactionAction $toggleChatReaction,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($toggleChatReaction->execute($chat, $message, $user, $request->validated()['emoji']));
    }
}
