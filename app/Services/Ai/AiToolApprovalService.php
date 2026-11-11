<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Enums\PendingToolCallStatusEnum;
use App\Models\ApiKey;
use App\Models\PendingToolCall;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * Creates and resolves PendingToolCall rows for MCP (human-in-the-loop) writes.
 */
class AiToolApprovalService
{
    public function __construct(
        private readonly AiToolArgumentRedactorService $redactor,
        private readonly AiToolWriteGateService $writeGate,
    ) {}

    /**
     * @param  array<string, mixed>  $arguments
     * @param  ApiKey|null  $apiKey  The key an MCP call came through, so the approved call keeps its scopes.
     */
    public function createPending(
        string $tool,
        array $arguments,
        string $surface = 'mcp',
        ?Authenticatable $actor = null,
        ?Carbon $expiresAt = null,
        ?ApiKey $apiKey = null,
    ): PendingToolCall {
        $ttl = max(1, (int) config('ai.tools.approval_ttl_minutes', 15));

        // Persist raw args so an approved call can still execute; audit/UI redact separately.
        return PendingToolCall::query()->create([
            'tool' => $tool,
            'surface' => $surface,
            'arguments' => $arguments,
            'status' => PendingToolCallStatusEnum::Pending,
            'requested_by' => $actor instanceof User ? $actor->id : null,
            'api_key_id' => $apiKey?->id,
            'expires_at' => $expiresAt ?? now()->addMinutes($ttl),
        ]);
    }

    /**
     * Arguments safe for admin UI / API payloads.
     *
     * @return array<string, mixed>
     */
    public function redactedArguments(PendingToolCall $pending): array
    {
        return $this->redactor->redact(
            is_array($pending->arguments) ? $pending->arguments : [],
        );
    }

    /**
     * Mark expired pending rows (does not execute tools).
     */
    public function expireOverdue(?Carbon $now = null): int
    {
        $now ??= now();

        return PendingToolCall::query()
            ->where('status', PendingToolCallStatusEnum::Pending)
            ->where('expires_at', '<=', $now)
            ->update([
                'status' => PendingToolCallStatusEnum::Expired,
                'resolved_at' => $now,
                'decision_note' => 'expired',
            ]);
    }

    /**
     * Reject a pending call. Never executes the tool.
     */
    public function reject(PendingToolCall $pending, User $approver, ?string $note = null): PendingToolCall
    {
        $this->assertStillPending($pending);

        $this->resolveOnce($pending, PendingToolCallStatusEnum::Rejected, $approver, $note ?? 'rejected');

        return $pending->refresh();
    }

    /**
     * Mark approved (execution is performed by AiToolExecutorService afterwards).
     */
    public function markApproved(PendingToolCall $pending, User $approver, ?string $note = null): PendingToolCall
    {
        $this->assertStillPending($pending);

        if (! $this->writeGate->isToolWriteAllowed($pending->tool)) {
            throw new InvalidArgumentException('Write tools are disabled for this tool class.');
        }

        $this->resolveOnce($pending, PendingToolCallStatusEnum::Approved, $approver, $note ?? 'approved');

        return $pending->refresh();
    }

    public function markExecuted(PendingToolCall $pending, string $result): PendingToolCall
    {
        $pending->forceFill([
            'status' => PendingToolCallStatusEnum::Executed,
            'result' => $result,
        ])->save();

        return $pending->refresh();
    }

    public function markFailed(PendingToolCall $pending, string $message): PendingToolCall
    {
        $pending->forceFill([
            'status' => PendingToolCallStatusEnum::Failed,
            'result' => $message,
        ])->save();

        return $pending->refresh();
    }

    /**
     * Moves a still-pending, unexpired call to its decision in one conditional UPDATE, so two
     * concurrent clicks cannot both approve (and run) or reject the same call (#441).
     *
     * @throws InvalidArgumentException when another request decided the call first
     */
    private function resolveOnce(
        PendingToolCall $pending,
        PendingToolCallStatusEnum $decision,
        User $approver,
        string $note,
    ): void {
        $now = now();

        $updated = PendingToolCall::query()
            ->whereKey($pending->getKey())
            ->where('status', PendingToolCallStatusEnum::Pending)
            ->where('expires_at', '>', $now)
            ->update([
                'status' => $decision,
                'resolved_by' => $approver->id,
                'resolved_at' => $now,
                'decision_note' => $note,
            ]);

        if ($updated !== 1) {
            throw new InvalidArgumentException('This tool call is no longer awaiting approval.');
        }
    }

    private function assertStillPending(PendingToolCall $pending): void
    {
        $this->expireOverdue();

        $pending->refresh();

        if ($pending->status === PendingToolCallStatusEnum::Expired || $pending->isExpired()) {
            if ($pending->status !== PendingToolCallStatusEnum::Expired) {
                $pending->forceFill([
                    'status' => PendingToolCallStatusEnum::Expired,
                    'resolved_at' => now(),
                    'decision_note' => 'expired',
                ])->save();
            }

            throw new InvalidArgumentException('This tool call approval has expired.');
        }

        if ($pending->status !== PendingToolCallStatusEnum::Pending) {
            throw new InvalidArgumentException('This tool call is no longer awaiting approval.');
        }
    }
}
