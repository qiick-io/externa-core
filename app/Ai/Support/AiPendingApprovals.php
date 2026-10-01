<?php

namespace App\Ai\Support;

use Laravel\Ai\Approvals\PendingApproval;
use Laravel\Ai\Enums\MessageStatus;
use Laravel\Ai\Models\ConversationMessage;

/**
 * Reads tool calls a paused assistant turn is still waiting on, in the SSE `tool_approval_request` shape.
 */
final class AiPendingApprovals
{
    /**
     * @return list<array{id: string, tool: string, arguments: array<string, mixed>, reason: string|null}>
     */
    public static function fromMessage(ConversationMessage $message): array
    {
        if ($message->role !== 'assistant' || $message->status !== MessageStatus::Paused) {
            return [];
        }

        $pending = [];

        foreach ($message->tool_calls as $toolCall) {
            if (! is_array($toolCall) || ! PendingApproval::isPending($toolCall)) {
                continue;
            }

            $pending[] = [
                'id' => (string) ($toolCall['id'] ?? ''),
                'tool' => (string) ($toolCall['name'] ?? ''),
                'arguments' => is_array($toolCall['arguments'] ?? null) ? $toolCall['arguments'] : [],
                'reason' => is_string($toolCall['approval_reason'] ?? null) ? $toolCall['approval_reason'] : null,
            ];
        }

        return $pending;
    }
}
