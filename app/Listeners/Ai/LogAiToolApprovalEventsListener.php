<?php

declare(strict_types=1);

namespace App\Listeners\Ai;

use App\Ai\Support\AiActivityLogger;
use App\Models\User;
use Laravel\Ai\Approvals\PendingApproval;
use Laravel\Ai\Events\ToolApprovalRequested;
use Laravel\Ai\Events\ToolApprovalResolved;
use Laravel\Ai\Responses\Data\ToolResult;

/**
 * Audit chat-surface tool approval requests and resolutions.
 */
class LogAiToolApprovalEventsListener
{
    public function handleRequested(ToolApprovalRequested $event): void
    {
        $actor = $event->conversationUser instanceof User ? $event->conversationUser : null;

        foreach ($event->pendingApprovals as $pending) {
            if (! $pending instanceof PendingApproval) {
                continue;
            }

            AiActivityLogger::toolDecision(
                actor: $actor,
                tool: $pending->tool,
                arguments: $pending->arguments,
                decision: 'pending',
                status: 'pending_approval',
                surface: 'chat',
                conversationId: $event->conversationId,
                extra: [
                    'approval_id' => $pending->id,
                    'reason' => $pending->reason,
                ],
            );
        }
    }

    public function handleResolved(ToolApprovalResolved $event): void
    {
        $actor = $event->conversationUser instanceof User ? $event->conversationUser : null;

        foreach ($event->toolResults as $result) {
            if (! $result instanceof ToolResult) {
                continue;
            }

            $decision = $result->denied ? 'rejected' : 'approved';
            $status = $result->denied ? 'denied' : ($result->failed ? 'failed' : 'ok');

            AiActivityLogger::toolDecision(
                actor: $actor,
                tool: $result->name,
                arguments: $result->arguments,
                decision: $decision,
                status: $status,
                surface: 'chat',
                approver: $actor,
                result: is_string($result->result) ? $result->result : null,
                conversationId: $event->conversationId,
                extra: [
                    'approval_id' => $result->id,
                ],
            );
        }
    }
}
