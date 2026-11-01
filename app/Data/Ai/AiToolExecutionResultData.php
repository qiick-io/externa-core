<?php

declare(strict_types=1);

namespace App\Data\Ai;

/**
 * Structured outcome from AiToolExecutorService (ok, denied, pending_approval, …).
 */
readonly class AiToolExecutionResultData
{
    /**
     * @param  'ok'|'denied'|'invalid_args'|'disabled'|'not_found'|'pending_approval'  $status
     */
    public function __construct(
        public string $status,
        public ?string $message = null,
        public ?string $result = null,
        public ?string $pendingId = null,
    ) {}

    public function isOk(): bool
    {
        return $this->status === 'ok';
    }

    public function isPendingApproval(): bool
    {
        return $this->status === 'pending_approval';
    }

    /**
     * @return array{status: string, message: ?string, result: ?string, pending_id: ?string}
     */
    public function toArray(): array
    {
        return [
            'status' => $this->status,
            'message' => $this->message,
            'result' => $this->result,
            'pending_id' => $this->pendingId,
        ];
    }
}
