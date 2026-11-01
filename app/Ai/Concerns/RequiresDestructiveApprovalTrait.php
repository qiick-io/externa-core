<?php

declare(strict_types=1);

namespace App\Ai\Concerns;

use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Concerns\InteractsWithApprovals;
use Laravel\Ai\Tools\Request;

/**
 * Pause the agent for user approval before an AI tool runs a write or destructive `action`.
 *
 * Tools using this trait must implement Laravel\Ai\Contracts\Approvable.
 * Read-only actions listed in neither {@see writeActions()} nor {@see destructiveActions()} run straight through.
 */
trait RequiresDestructiveApprovalTrait
{
    use InteractsWithApprovals;

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
     * Request approval for write and destructive actions; reads run straight through.
     */
    protected function needsApproval(Request $request): Approval|bool
    {
        $action = (string) $request->string('action');

        if (in_array($action, $this->destructiveActions(), true)) {
            return Approval::required(sprintf('%s %s deletes data.', class_basename($this), $action));
        }

        if (in_array($action, $this->writeActions(), true)) {
            return Approval::required(sprintf('%s %s writes data.', class_basename($this), $action));
        }

        return false;
    }
}
