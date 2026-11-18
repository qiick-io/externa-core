<?php

declare(strict_types=1);

namespace App\Ai\Concerns;

use App\Contracts\Ai\ClassifiesToolActionsContract;
use App\Enums\AiToolKindEnum;
use App\Services\Ai\AiToolWriteGateService;
use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Concerns\InteractsWithApprovals;
use Laravel\Ai\Tools\Request;

/**
 * Classify an AI tool's `action` as read, write or destructive.
 *
 * Read actions (listed in neither {@see writeActions()} nor {@see destructiveActions()})
 * run straight through. Write and destructive actions pause for the user's approval,
 * or are refused on a {@see withWriteActionsDenied()} copy, which the registry hands to
 * chat while the AI write gate is closed for this tool. Destructive actions are also
 * refused while `AI_TOOLS_DESTRUCTIVE_ENABLED` is off (the default, #766), on every
 * surface, since the refusal runs inside `handle()`.
 *
 * Tools using this trait must implement Laravel\Ai\Contracts\Approvable and
 * {@see ClassifiesToolActionsContract}, and call {@see writeActionRefusal()} at the
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
     * Actions of this tool that delete data or touch security, and need the user's approval
     * first, one call at a time.
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

    public function kindOfAction(string $action): AiToolKindEnum
    {
        if (in_array($action, $this->destructiveActions(), true)) {
            return AiToolKindEnum::Destructive;
        }

        return in_array($action, $this->writeActions(), true) ? AiToolKindEnum::Write : AiToolKindEnum::Read;
    }

    /**
     * Request approval for write and destructive actions; reads run straight through.
     *
     * A refused call needs no approval: {@see writeActionRefusal()} refuses it.
     */
    protected function needsApproval(Request $request): Approval|bool
    {
        $action = (string) $request->string('action');

        if ($this->isWriteActionDenied || $this->isDestructiveActionRefused($action)) {
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
     * Error text when a write-denied copy receives a write or destructive action, or any copy
     * a destructive action while destructive AI tools are off; else null.
     */
    protected function writeActionRefusal(Request $request): ?string
    {
        $action = (string) $request->string('action');
        $isMutatingAction = in_array($action, [...$this->writeActions(), ...$this->destructiveActions()], true);

        if ($this->isWriteActionDenied && $isMutatingAction) {
            return sprintf(
                'Error: %s %s is disabled because AI write tools are off for this tool (AI_TOOLS_WRITE_ENABLED and the write-tool allowlist). Only read actions are available.',
                class_basename($this),
                $action,
            );
        }

        if ($this->isDestructiveActionRefused($action)) {
            return sprintf(
                'Error: %s %s is a destructive action, and destructive AI tools are off (AI_TOOLS_DESTRUCTIVE_ENABLED). Ask the user to do it in the app.',
                class_basename($this),
                $action,
            );
        }

        return null;
    }

    private function isDestructiveActionRefused(string $action): bool
    {
        return in_array($action, $this->destructiveActions(), true)
            && ! app(AiToolWriteGateService::class)->isDestructiveEnabled();
    }
}
