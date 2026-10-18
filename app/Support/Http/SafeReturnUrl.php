<?php

namespace App\Support\Http;

/**
 * Same-origin relative /collections/... return paths (mirrors FE safe-return-url).
 */
final class SafeReturnUrl
{
    public static function from(mixed $candidate): ?string
    {
        if (! is_string($candidate) || $candidate === '') {
            return null;
        }

        if (str_contains($candidate, '..')) {
            return null;
        }

        if (preg_match('#^https?://#i', $candidate) === 1 || str_starts_with($candidate, '//')) {
            return null;
        }

        if (! str_starts_with($candidate, '/collections/')) {
            return null;
        }

        $path = parse_url($candidate, PHP_URL_PATH);
        if (! is_string($path) || ! str_starts_with($path, '/collections/')) {
            return null;
        }

        $query = parse_url($candidate, PHP_URL_QUERY);

        return is_string($query) && $query !== '' ? $path.'?'.$query : $path;
    }
}
