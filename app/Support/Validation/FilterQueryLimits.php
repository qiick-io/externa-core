<?php

namespace App\Support\Validation;

use Illuminate\Validation\ValidationException;

/**
 * Cap filter map size and operand string lengths for item list queries.
 */
final class FilterQueryLimits
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public static function assertValid(array $filters): array
    {
        if (count($filters) > StringLimits::FILTER_MAX_KEYS) {
            throw ValidationException::withMessages([
                'filter' => 'Too many filter keys (max '.StringLimits::FILTER_MAX_KEYS.').',
            ]);
        }

        foreach ($filters as $fieldName => $value) {
            if (! is_string($fieldName) || $fieldName === '') {
                continue;
            }

            self::assertOperand($value, "filter.{$fieldName}");
        }

        return $filters;
    }

    /**
     * @throws ValidationException
     */
    private static function assertOperand(mixed $value, string $attribute): void
    {
        if (is_string($value)) {
            if (mb_strlen($value) > StringLimits::FILTER_VALUE) {
                throw ValidationException::withMessages([
                    $attribute => 'Filter value may not be greater than '.StringLimits::FILTER_VALUE.' characters.',
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
                if (mb_strlen($operand) > StringLimits::FILTER_VALUE) {
                    throw ValidationException::withMessages([
                        $path => 'Filter value may not be greater than '.StringLimits::FILTER_VALUE.' characters.',
                    ]);
                }

                continue;
            }

            if (is_array($operand)) {
                foreach ($operand as $index => $item) {
                    if (is_string($item) && mb_strlen($item) > StringLimits::FILTER_VALUE) {
                        throw ValidationException::withMessages([
                            $path.'.'.$index => 'Filter value may not be greater than '.StringLimits::FILTER_VALUE.' characters.',
                        ]);
                    }
                }
            }
        }
    }
}
