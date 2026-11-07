<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Enums\FieldTypeEnum;

/**
 * Documented matrix of safe field type / translatable conversions (#220).
 *
 * Supported type pairs:
 * - string ↔ textarea ↔ markdown (any direction within the text-scalar family)
 * - string → select (with option mapping / auto-create options)
 *
 * Translatable flips (same or convertible type):
 * - non-translatable → translatable (value moved under the default content locale)
 * - translatable → non-translatable (value taken from a chosen locale)
 *
 * Everything else (relations, files, blocks, number↔string, …) stays rejected
 * by {@see CollectionFieldStorageShapeService}.
 */
class CollectionFieldConvertMatrixService
{
    /**
     * Text-scalar types that share the same storage shape (nullable string).
     *
     * @var list<FieldTypeEnum>
     */
    public const TEXT_SCALAR_FAMILY = [
        FieldTypeEnum::String,
        FieldTypeEnum::Textarea,
        FieldTypeEnum::Markdown,
    ];

    /**
     * Whether a type↔type change is in the supported matrix (ignores translatable).
     */
    public function isTypePairSupported(FieldTypeEnum $from, FieldTypeEnum $to): bool
    {
        if ($from === $to) {
            return true;
        }

        if ($this->isTextScalar($from) && $this->isTextScalar($to)) {
            return true;
        }

        return $from === FieldTypeEnum::String && $to === FieldTypeEnum::Select;
    }

    /**
     * Whether the overall conversion (type + optional translatable flip) is allowed.
     */
    public function isSupported(
        FieldTypeEnum $fromType,
        FieldTypeEnum $toType,
        bool $fromTranslatable,
        bool $toTranslatable,
    ): bool {
        if (! $toType->isTranslatableSupported() && $toTranslatable) {
            return false;
        }

        if (! $this->isTypePairSupported($fromType, $toType)) {
            return false;
        }

        // Same shape and same flag — no conversion needed, but "supported" for idempotency.
        return true;
    }

    /**
     * Target types an editor may convert this field into (excluding current when unchanged).
     *
     * @return list<string>
     */
    public function supportedTargetTypes(FieldTypeEnum $from): array
    {
        $targets = [];

        foreach (self::TEXT_SCALAR_FAMILY as $candidate) {
            if ($this->isTypePairSupported($from, $candidate)) {
                $targets[] = $candidate->value;
            }
        }

        if ($this->isTypePairSupported($from, FieldTypeEnum::Select)) {
            $targets[] = FieldTypeEnum::Select->value;
        }

        return array_values(array_unique($targets));
    }

    /**
     * Human-readable matrix rows for docs / dry-run payloads / PR description.
     *
     * @return list<array{from: string, to: string, translatable: string}>
     */
    public function documentedMatrix(): array
    {
        return [
            [
                'from' => 'string|textarea|markdown',
                'to' => 'string|textarea|markdown',
                'translatable' => 'unchanged or flip',
            ],
            [
                'from' => 'string',
                'to' => 'select',
                'translatable' => 'unchanged or flip (with option mapping)',
            ],
            [
                'from' => '(any supported type)',
                'to' => '(same type)',
                'translatable' => 'false→true (default locale) or true→false (pick locale)',
            ],
        ];
    }

    public function isTextScalar(FieldTypeEnum $type): bool
    {
        return in_array($type, self::TEXT_SCALAR_FAMILY, true);
    }
}
