<?php

declare(strict_types=1);

namespace App\Contracts\Ai;

use App\Ai\Concerns\RequiresDestructiveApprovalTrait;

/**
 * An AI tool whose `action` argument mixes read and write/destructive actions.
 *
 * The registry can then expose its read actions in chat while the write gate is closed.
 * Implemented through {@see RequiresDestructiveApprovalTrait}.
 */
interface ClassifiesToolActionsInterface
{
    /**
     * Copy of the tool that runs read actions and refuses every write or destructive action.
     */
    public function withWriteActionsDenied(): static;
}
