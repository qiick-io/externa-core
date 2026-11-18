<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\DB;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;

/**
 * Transactional delete/truncate helpers for AI conversations.
 */
class AiConversationMutationService
{
    /**
     * Delete a conversation and all of its messages.
     */
    public function deleteConversation(Conversation $conversation): void
    {
        DB::transaction(function () use ($conversation): void {
            ConversationMessage::query()
                ->where('conversation_id', $conversation->id)
                ->delete();

            $conversation->delete();
        });
    }

    /**
     * Delete many conversations and their messages.
     *
     * @param  list<string>  $conversationIds
     */
    public function deleteConversations(array $conversationIds): int
    {
        return (int) DB::transaction(function () use ($conversationIds): int {
            ConversationMessage::query()
                ->whereIn('conversation_id', $conversationIds)
                ->delete();

            return Conversation::query()
                ->whereIn('id', $conversationIds)
                ->delete();
        });
    }

    /**
     * Delete the anchor message and every message that follows it.
     */
    public function truncateFromMessage(Conversation $conversation, ConversationMessage $anchor): int
    {
        // The vendor model documents no timestamps, so read the column through getAttribute().
        $anchorCreatedAt = $anchor->getAttribute('created_at');

        return (int) DB::transaction(function () use ($conversation, $anchor, $anchorCreatedAt): int {
            return ConversationMessage::query()
                ->where('conversation_id', $conversation->id)
                ->where(function ($query) use ($anchor, $anchorCreatedAt): void {
                    $query->where('created_at', '>', $anchorCreatedAt)
                        ->orWhere(function ($sameInstant) use ($anchor, $anchorCreatedAt): void {
                            $sameInstant->where('created_at', $anchorCreatedAt)
                                ->where('id', '>=', $anchor->id);
                        });
                })
                ->delete();
        });
    }
}
