<?php

declare(strict_types=1);

namespace App\Ai\Concerns;

use App\Contracts\Ai\ClassifiesToolActionsInterface;
use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Concerns\InteractsWithApprovals;
use Laravel\Ai\Tools\Request;

/**
 * Classify an AI tool's `action` as read, write or destructive.
 *
 * Read actions (listed in neither {@see writeActions()} nor {@see destructiveActions()})
 * run straight through. Write and destructive actions pause for the user's approval,
 * or are refused on a {@see withWriteActionsDenied()} copy, which the registry hands to
 * chat while the AI write gate is closed for this tool.
 *
 * Tools using this trait must implement Laravel\Ai\Contracts\Approvable and
 * {@see ClassifiesToolActionsInterface}, and call {@see writeActionRefusal()} at the
 * start of `handle()`.
 */
trait RequiresDestructiveApprovalTrait
{
    use InteractsWithApprovals;

    private bool $isWriteActionDenied = false;

    /**
     * Actions of this tool that mutate data without deleting (create/update/move/…).
     *
     * @return list<string>
     */
    abstract protected function writeActions(): array;

    /**
     * Actions of this tool that delete data and need the user's approval first.
     *
     * @return list<string>
     */
    abstract protected function destructiveActions(): array;

    /**
     * Copy of this tool that runs read actions and refuses every write or destructive action.
     */
    public function withWriteActionsDenied(): static
    {
        $readOnlyTool = clone $this;
        $readOnlyTool->isWriteActionDenied = true;

        return $readOnlyTool;
    }

    /**
     * Request approval for write and destructive actions; reads run straight through.
     *
     * A denied write needs no approval: {@see writeActionRefusal()} refuses it.
     */
    protected function needsApproval(Request $request): Approval|bool
    {
        $action = (string) $request->string('action');

        if ($this->isWriteActionDenied) {
            return false;
        }

        if (in_array($action, $this->destructiveActions(), true)) {
            return Approval::required(sprintf('%s %s deletes data.', class_basename($this), $action));
        }

        if (in_array($action, $this->writeActions(), true)) {
            return Approval::required(sprintf('%s %s writes data.', class_basename($this), $action));
        }

        return false;
    }

    /**
     * Error text when a write-denied copy receives a write or destructive action, else null.
     */
    protected function writeActionRefusal(Request $request): ?string
    {
        $action = (string) $request->string('action');
        $isMutatingAction = in_array($action, [...$this->writeActions(), ...$this->destructiveActions()], true);

        if (! $this->isWriteActionDenied || ! $isMutatingAction) {
            return null;
        }

        return sprintf(
            'Error: %s %s is disabled because AI write tools are off for this tool (AI_WRITE_TOOLS and the write-tool allowlist). Only read actions are available.',
            class_basename($this),
            $action,
        );
    }
}
