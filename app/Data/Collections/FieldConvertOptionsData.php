<?php

declare(strict_types=1);

namespace App\Data\Collections;

use App\Enums\FieldTypeEnum;

/**
 * Options for a field type / translatable conversion (#220).
 *
 * @phpstan-type OptionMapping array<string, string>
 */
readonly class FieldConvertOptionsData
{
    /**
     * @param  OptionMapping  $optionMapping  Old scalar → select option value (string→select)
     * @param  array<string, mixed>|null  $settings  Merged onto field settings when applying
     */
    public function __construct(
        public FieldTypeEnum $toType,
        public bool $toTranslatable,
        public ?string $locale = null,
        public array $optionMapping = [],
        public bool $createMissingOptions = true,
        public ?array $settings = null,
        public int $chunkSize = 100,
        public bool $dryRun = false,
    ) {}
}
