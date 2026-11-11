<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\PendingToolCall;
use App\Models\User;
use App\Services\Ai\AiToolRegistryService;

/**
 * Who may decide an AI tool call awaiting human approval (#441).
 *
 * Deciding a call needs the abilities of the tool itself, checked against the call's arguments by
 * {@see AiToolRegistryService::actorPassesAbilities()} (super-admins are granted there). The
 * requester may always withdraw (reject) their own call. Approving one's own call is allowed as
 * long as the requester passes the tool abilities: whether to forbid self-approval is an open
 * product decision in #441, so this policy keeps today's behaviour.
 */
final class PendingToolCallPolicy
{
    public function __construct(
        private AiToolRegistryService $registry,
    ) {}

    public function approve(?User $user, PendingToolCall $pendingToolCall): bool
    {
        return $this->passesToolAbilities($user, $pendingToolCall);
    }

    public function reject(?User $user, PendingToolCall $pendingToolCall): bool
    {
        return $this->isRequester($user, $pendingToolCall)
            || $this->passesToolAbilities($user, $pendingToolCall);
    }

    private function isRequester(?User $user, PendingToolCall $pendingToolCall): bool
    {
        return $user !== null
            && $pendingToolCall->requested_by !== null
            && $pendingToolCall->requested_by === $user->id;
    }

    /**
     * False for an unknown (unregistered) tool, so a stale row can never be decided by ability.
     */
    private function passesToolAbilities(?User $user, PendingToolCall $pendingToolCall): bool
    {
        if ($user === null) {
            return false;
        }

        $definition = $this->registry->get($pendingToolCall->tool);

        return $definition !== null && $this->registry->actorPassesAbilities(
            $definition,
            $user,
            is_array($pendingToolCall->arguments) ? $pendingToolCall->arguments : [],
        );
    }
}
