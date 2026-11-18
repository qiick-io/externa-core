<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Chat\ToggleChatReactionAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\ReactToChatMessageRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Chat\ChatService;
use App\Traits\ResolvesItemChatTrait;
use Illuminate\Http\JsonResponse;

/**
 * Item-form chat alias for emoji reactions on a message of the item thread
 * (same Action as the hub's `ChatMessageReactionController`).
 */
class ItemChatReactionController extends Controller
{
    use ResolvesItemChatTrait;

    public function __construct(
        private ChatService $chats,
    ) {}

    public function react(
        ReactToChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
        ToggleChatReactionAction $toggleChatReaction,
    ): JsonResponse {
        $chat = $this->existingItemChat($item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($toggleChatReaction->execute($chat, $message, $user, $request->validated()['emoji']));
    }
}
