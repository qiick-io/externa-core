<?php

declare(strict_types=1);

namespace App\Console\Commands\Ai;

use App\Enums\PendingToolCallStatusEnum;
use App\Models\PendingToolCall;
use App\Services\Ai\AiToolApprovalService;
use Illuminate\Console\Command;
use Spatie\Activitylog\Models\Activity;

/**
 * Expire overdue PendingToolCall rows and prune aged AI tool audit entries.
 */
class PruneAiToolAuditCommand extends Command
{
    protected $signature = 'ai:prune-tool-audit';

    protected $description = 'Expire overdue AI tool approvals and prune aged ai_tool audit log rows';

    public function handle(AiToolApprovalService $approvals): int
    {
        $expired = $approvals->expireOverdue();

        $retentionDays = max(1, (int) config('ai.tools.audit_retention_days', 90));
        $cutoff = now()->subDays($retentionDays);

        $prunedActivities = Activity::query()
            ->inLog('ai')
            ->forEvent('ai_tool')
            ->where('created_at', '<', $cutoff)
            ->delete();

        $prunedPending = PendingToolCall::query()
            ->whereIn('status', [
                PendingToolCallStatusEnum::Rejected,
                PendingToolCallStatusEnum::Expired,
                PendingToolCallStatusEnum::Executed,
                PendingToolCallStatusEnum::Failed,
            ])
            ->where('updated_at', '<', $cutoff)
            ->delete();

        $this->info(sprintf(
            'Expired %d pending approval(s); pruned %d ai_tool audit row(s) and %d resolved pending_tool_calls older than %d day(s).',
            $expired,
            $prunedActivities,
            $prunedPending,
            $retentionDays,
        ));

        return self::SUCCESS;
    }
}
