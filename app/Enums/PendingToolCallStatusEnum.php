<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Lifecycle status for MCP (and other non-chat) AI tool calls awaiting human approval.
 */
enum PendingToolCallStatusEnum: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Expired = 'expired';
    case Executed = 'executed';
    case Failed = 'failed';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function isTerminal(): bool
    {
        return match ($this) {
            self::Pending => false,
            self::Approved, self::Rejected, self::Expired, self::Executed, self::Failed => true,
        };
    }
}
