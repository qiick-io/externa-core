<?php

declare(strict_types=1);

namespace App\Data\Ai;

/**
 * Validated AI item draft: proposed values keyed by field name (flat, for the requested locale)
 * and the fields the model proposed that failed the field rules, each with the first reason.
 */
readonly class ItemDraftResultData
{
    /**
     * @param  array<string, string|list<string>>  $values
     * @param  list<array{field: string, reason: string}>  $droppedFields
     */
    public function __construct(
        public array $values,
        public array $droppedFields,
        public ?string $model,
    ) {}

    /**
     * JSON body of the draft endpoint; `data` stays an object even when empty.
     *
     * @return array{data: object, dropped: list<array{field: string, reason: string}>}
     */
    public function toResponseArray(): array
    {
        return [
            'data' => (object) $this->values,
            'dropped' => $this->droppedFields,
        ];
    }
}
