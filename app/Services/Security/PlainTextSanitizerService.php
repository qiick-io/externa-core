<?php

declare(strict_types=1);

namespace App\Services\Security;

/**
 * Strip HTML from plain-text fields (stored XSS mitigation).
 */
final class PlainTextSanitizerService
{
    public static function sanitize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return trim(strip_tags($value));
    }
}
