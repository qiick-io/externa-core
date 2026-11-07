<?php

declare(strict_types=1);

namespace App\Data\Collections;

/**
 * Dry-run or apply result for a field conversion (#220).
 *
 * @phpstan-type ItemRow array{
 *     item_id: int,
 *     status: 'ok'|'unchanged'|'failed'|'skipped',
 *     reason: ?string,
 *     has_draft: bool,
 *     published_before: mixed,
 *     published_after: mixed,
 *     draft_before: mixed,
 *     draft_after: mixed
 * }
 */
readonly class FieldConvertResultData
{
    /**
     * @param  list<ItemRow>  $items
     * @param  array{ok: int, unchanged: int, failed: int, skipped: int, with_draft: int}  $counts
     * @param  list<array{from: string, to: string, translatable: string}>  $matrix
     */
    public function __construct(
        public bool $supported,
        public bool $dryRun,
        public bool $applied,
        public string $fromType,
        public string $toType,
        public bool $fromTranslatable,
        public bool $toTranslatable,
        public array $items,
        public array $counts,
        public array $matrix,
        public ?string $error = null,
        public ?int $fieldId = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'supported' => $this->supported,
            'dry_run' => $this->dryRun,
            'applied' => $this->applied,
            'field_id' => $this->fieldId,
            'from_type' => $this->fromType,
            'to_type' => $this->toType,
            'from_translatable' => $this->fromTranslatable,
            'to_translatable' => $this->toTranslatable,
            'items' => $this->items,
            'counts' => $this->counts,
            'matrix' => $this->matrix,
            'error' => $this->error,
        ];
    }
}
