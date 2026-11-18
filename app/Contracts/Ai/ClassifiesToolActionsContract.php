<?php

declare(strict_types=1);

namespace App\Contracts\Ai;

use App\Ai\Concerns\RequiresDestructiveApprovalTrait;
use App\Enums\AiToolKindEnum;

/**
 * An AI tool whose `action` argument mixes read and write/destructive actions.
 *
 * The registry can then expose its read actions in chat while the write gate is closed.
 * Implemented through {@see RequiresDestructiveApprovalTrait}.
 */
interface ClassifiesToolActionsContract
{
    /**
     * Copy of the tool that runs read actions and refuses every write or destructive action.
     */
    public function withWriteActionsDenied(): static;

    /**
     * Kind of one call of this tool: its `action` is read, write or destructive. The executor
     * gates each call by it, since the tool as a whole mixes all three.
     */
    public function kindOfAction(string $action): AiToolKindEnum;
}
