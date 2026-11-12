<?php

declare(strict_types=1);

namespace App\Actions\Chat;

use App\Events\ItemChatReactionToggledEvent;
use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\CollectionItemChatReaction;
use App\Models\User;
use App\Services\Chat\ChatMessageSerializerService;
use Illuminate\Validation\ValidationException;

/**
 * Add the user's emoji reaction to a message, or remove it when it is there.
 */
class ToggleChatReactionAction
{
    public function __construct(
        private ChatMessageSerializerService $serializer,
    ) {}

    /**
     * Broadcasts `ItemChatReactionToggledEvent`.
     *
     * @return array{message_id: int, emoji: string, added: bool, reactions: list<array<string, mixed>>}
     *
     * @throws ValidationException When the emoji is not an allowed reaction
     */
    public function execute(Chat $chat, CollectionItemChatMessage $message, User $user, string $emoji): array
    {
        if (! in_array($emoji, CollectionItemChatReaction::ALLOWED, true)) {
            throw ValidationException::withMessages([
                'emoji' => __('Unsupported reaction.'),
            ]);
        }

        $existing = CollectionItemChatReaction::query()
            ->where('message_id', $message->id)
            ->where('user_id', $user->id)
            ->where('emoji', $emoji)
            ->first();

        $added = $existing === null;
        if ($existing instanceof CollectionItemChatReaction) {
            $existing->delete();
        } else {
            CollectionItemChatReaction::query()->create([
                'message_id' => $message->id,
                'user_id' => $user->id,
                'emoji' => $emoji,
            ]);
        }

        event(new ItemChatReactionToggledEvent(
            $chat->id,
            (int) $message->id,
            (int) $user->id,
            $this->serializer->displayName($user),
            $emoji,
            $added,
        ));

        $message->load($this->serializer->messageRelations());

        return [
            'message_id' => $message->id,
            'emoji' => $emoji,
            'added' => $added,
            'reactions' => $this->serializer->serializeReactions($message, $user),
        ];
    }
}
