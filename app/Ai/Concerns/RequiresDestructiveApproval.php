<?php

namespace App\Ai\Concerns;

use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Concerns\InteractsWithApprovals;
use Laravel\Ai\Tools\Request;

/**
 * Pause the agent for user approval before an AI tool runs a destructive `action`.
 *
 * Tools using this trait must implement Laravel\Ai\Contracts\Approvable.
 */
trait RequiresDestructiveApproval
{
    use InteractsWithApprovals;

    /**
     * Actions of this tool that delete data and need the user's approval first.
     *
     * @return list<string>
     */
    abstract protected function destructiveActions(): array;

    /**
     * Request approval only for destructive actions; reads and writes run straight through.
     */
    protected function needsApproval(Request $request): Approval|bool
    {
        $action = (string) $request->string('action');

        if (! in_array($action, $this->destructiveActions(), true)) {
            return false;
        }

        return Approval::required(sprintf('%s %s deletes data.', class_basename($this), $action));
    }
}
