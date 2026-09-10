<?php

namespace App\Support\Security;

/**
 * Strip HTML from plain-text fields (stored XSS mitigation).
 */
final class PlainTextSanitizer
{
    public static function sanitize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return trim(strip_tags($value));
    }
}
