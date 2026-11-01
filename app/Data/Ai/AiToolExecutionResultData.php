<?php

declare(strict_types=1);

namespace App\Data\Ai;

/**
 * Structured outcome from AiToolExecutorService (ok, denied, invalid_args, …).
 */
readonly class AiToolExecutionResultData
{
    /**
     * @param  'ok'|'denied'|'invalid_args'|'disabled'|'not_found'  $status
     */
    public function __construct(
        public string $status,
        public ?string $message = null,
        public ?string $result = null,
    ) {}

    public function isOk(): bool
    {
        return $this->status === 'ok';
    }

    /**
     * @return array{status: string, message: ?string, result: ?string}
     */
    public function toArray(): array
    {
        return [
            'status' => $this->status,
            'message' => $this->message,
            'result' => $this->result,
        ];
    }
}
