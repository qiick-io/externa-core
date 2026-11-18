<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\CollectionItemChatMessage;
use App\Models\User;

/**
 * Chat message ownership: only the author edits or deletes a message, super-admins included.
 *
 * Thread access is checked first through {@see ChatPolicy::view()}; this policy only adds the
 * author rule on top.
 */
final class CollectionItemChatMessagePolicy
{
    public function update(?User $user, CollectionItemChatMessage $message): bool
    {
        return $this->isAuthor($user, $message);
    }

    public function delete(?User $user, CollectionItemChatMessage $message): bool
    {
        return $this->isAuthor($user, $message);
    }

    private function isAuthor(?User $user, CollectionItemChatMessage $message): bool
    {
        return $user instanceof User && (int) $message->user_id === (int) $user->id;
    }
}
