<?php

declare(strict_types=1);

namespace App\Services\Validation;

use Illuminate\Validation\ValidationException;

/**
 * Cap filter map size, operand string lengths, and relational path depth for item list queries.
 *
 * Relational (dotted) paths: `relationField.relatedField` is depth 1 (hard cap
 * {@see StringLimitsService::FILTER_MAX_RELATION_DEPTH}). Deeper paths such as `a.b.c` are rejected.
 */
final class FilterQueryLimitsService
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public static function assertValid(array $filters): array
    {
        if (count($filters) > StringLimitsService::FILTER_MAX_KEYS) {
            throw ValidationException::withMessages([
                'filter' => __('Too many filter keys (max :max).', ['max' => StringLimitsService::FILTER_MAX_KEYS]),
            ]);
        }

        foreach ($filters as $fieldName => $value) {
            if (! is_string($fieldName) || $fieldName === '') {
                continue;
            }

            self::assertRelationDepth($fieldName);
            self::assertOperand($value, "filter.{$fieldName}");
        }

        return $filters;
    }

    /**
     * Count depth-1+ relational filter keys (for API cost budgeting).
     *
     * @param  array<string, mixed>  $filters
     */
    public static function relationalKeyCount(array $filters): int
    {
        $count = 0;
        foreach ($filters as $fieldName => $_) {
            if (is_string($fieldName) && str_contains($fieldName, '.')) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * @throws ValidationException
     */
    private static function assertRelationDepth(string $fieldName): void
    {
        if (! str_contains($fieldName, '.')) {
            return;
        }

        $parts = explode('.', $fieldName);
        foreach ($parts as $part) {
            if ($part === '' || preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $part) !== 1) {
                throw ValidationException::withMessages([
                    'filter' => "Invalid relational filter path [{$fieldName}].",
                ]);
            }
        }

        $depth = count($parts) - 1;
        if ($depth > StringLimitsService::FILTER_MAX_RELATION_DEPTH) {
            throw ValidationException::withMessages([
                'filter' => 'Relational filter depth may not exceed '.StringLimitsService::FILTER_MAX_RELATION_DEPTH
                    ." (got {$depth} for [{$fieldName}]).",
            ]);
        }
    }

    /**
     * @throws ValidationException
     */
    private static function assertOperand(mixed $value, string $attribute): void
    {
        if (is_string($value)) {
            if (mb_strlen($value) > StringLimitsService::FILTER_VALUE) {
                throw ValidationException::withMessages([
                    $attribute => __('Filter value may not be greater than :max characters.', ['max' => StringLimitsService::FILTER_VALUE]),
                ]);
            }

            return;
        }

        if (! is_array($value)) {
            return;
        }

        foreach ($value as $key => $operand) {
            $path = is_string($key) || is_int($key)
                ? $attribute.'.'.$key
                : $attribute;

            if (is_string($operand)) {
                if (mb_strlen($operand) > StringLimitsService::FILTER_VALUE) {
                    throw ValidationException::withMessages([
                        $path => __('Filter value may not be greater than :max characters.', ['max' => StringLimitsService::FILTER_VALUE]),
                    ]);
                }

                continue;
            }

            if (is_array($operand)) {
                foreach ($operand as $index => $item) {
                    if (is_string($item) && mb_strlen($item) > StringLimitsService::FILTER_VALUE) {
                        throw ValidationException::withMessages([
                            $path.'.'.$index => __('Filter value may not be greater than :max characters.', ['max' => StringLimitsService::FILTER_VALUE]),
                        ]);
                    }
                }
            }
        }
    }
}
