<?php

declare(strict_types=1);

namespace App\Traits;

/**
 * Scalar normalizers shared by the project settings area readers, so a stored
 * URL or bounded integer means the same thing in every settings section.
 */
trait NormalizesProjectSettingValuesTrait
{
    private function nullableUrl(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return trim($value);
    }

    private function nullablePositiveInt(mixed $value, int $min, int $max): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (! is_numeric($value)) {
            return null;
        }

        $int = (int) $value;

        if ($int < $min || $int > $max) {
            return null;
        }

        return $int;
    }
}
