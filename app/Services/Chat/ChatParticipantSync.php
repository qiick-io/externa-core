<?php

namespace App\Services\Chat;

use App\Models\Chat;
use App\Models\ChatParticipant;
use App\Models\UserGroup;

/**
 * Expand/remove via_group user rows when group membership changes.
 */
class ChatParticipantSync
{
    public function userJoinedGroup(int $groupId, int $userId): void
    {
        $chatIds = ChatParticipant::query()
            ->where('user_group_id', $groupId)
            ->pluck('chat_id');

        foreach ($chatIds as $chatId) {
            ChatParticipant::query()->firstOrCreate(
                [
                    'chat_id' => $chatId,
                    'user_id' => $userId,
                ],
                [
                    'user_group_id' => null,
                    'source' => ChatParticipant::SOURCE_VIA_GROUP,
                ],
            );
        }
    }

    public function userLeftGroup(int $groupId, int $userId): void
    {
        $chatIds = ChatParticipant::query()
            ->where('user_group_id', $groupId)
            ->pluck('chat_id');

        foreach ($chatIds as $chatId) {
            $row = ChatParticipant::query()
                ->where('chat_id', $chatId)
                ->where('user_id', $userId)
                ->first();

            if (! $row instanceof ChatParticipant) {
                continue;
            }

            if ($row->source === ChatParticipant::SOURCE_EXPLICIT) {
                continue;
            }

            if ($this->stillInAnotherParticipatingGroup($chatId, $groupId, $userId)) {
                continue;
            }

            $row->delete();
        }
    }

    public function expandGroup(Chat $chat, UserGroup $group): void
    {
        foreach ($group->users()->where('is_active', true)->pluck('users.id') as $userId) {
            ChatParticipant::query()->firstOrCreate(
                [
                    'chat_id' => $chat->id,
                    'user_id' => (int) $userId,
                ],
                [
                    'user_group_id' => null,
                    'source' => ChatParticipant::SOURCE_VIA_GROUP,
                ],
            );
        }
    }

    private function stillInAnotherParticipatingGroup(string $chatId, int $leavingGroupId, int $userId): bool
    {
        $otherGroupIds = ChatParticipant::query()
            ->where('chat_id', $chatId)
            ->whereNotNull('user_group_id')
            ->where('user_group_id', '!=', $leavingGroupId)
            ->pluck('user_group_id');

        if ($otherGroupIds->isEmpty()) {
            return false;
        }

        return UserGroup::query()
            ->whereIn('id', $otherGroupIds)
            ->whereHas('users', fn ($query) => $query->where('users.id', $userId))
            ->exists();
    }
}
