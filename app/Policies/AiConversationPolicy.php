<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use Laravel\Ai\Models\Conversation;

/**
 * AppAssistant conversations are private to their participant.
 *
 * Only the user who owns a conversation may read, continue, pin, truncate or delete it, and
 * super-admins get no exception (the model has a policy, so `Gate::before` does not bypass it).
 * Callers deny with an empty 404 (`abort_unless(Gate::allows(...), 404)`) so a foreign
 * conversation is indistinguishable from a missing one. Registered with `Gate::policy()` in
 * AppServiceProvider because the model lives in laravel/ai.
 */
final class AiConversationPolicy
{
    public function view(?User $user, Conversation $conversation): bool
    {
        return $this->isParticipant($user, $conversation);
    }

    public function update(?User $user, Conversation $conversation): bool
    {
        return $this->isParticipant($user, $conversation);
    }

    public function delete(?User $user, Conversation $conversation): bool
    {
        return $this->isParticipant($user, $conversation);
    }

    /**
     * The same match as `$user->conversations()` (the HasConversations morph on participant).
     * The vendor model declares no attribute types, hence getAttribute().
     */
    private function isParticipant(?User $user, Conversation $conversation): bool
    {
        if ($user === null) {
            return false;
        }

        $participantId = $conversation->getAttribute('participant_id');

        return $conversation->getAttribute('participant_type') === $user->getMorphClass()
            && is_scalar($participantId)
            && (string) $participantId === (string) $user->getKey();
    }
}
