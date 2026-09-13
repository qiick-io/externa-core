<?php

namespace App\Support\Api;

/**
 * Normalize and validate browser Origin URLs (scheme + host + optional port, no path).
 */
final class PublicApiOrigin
{
    /**
     * Whether the value is a usable origin URL (http/https, no path/query/fragment).
     */
    public static function isValid(string $value): bool
    {
        return self::normalize($value) !== null;
    }

    /**
     * Canonical origin string, or null when invalid.
     */
    public static function normalize(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $parts = parse_url($value);
        if (! is_array($parts)) {
            return null;
        }

        $scheme = isset($parts['scheme']) ? strtolower($parts['scheme']) : null;
        $host = isset($parts['host']) ? strtolower($parts['host']) : null;

        if ($scheme === null || $host === null || $host === '') {
            return null;
        }

        if (! in_array($scheme, ['http', 'https'], true)) {
            return null;
        }

        if (isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            return null;
        }

        $path = $parts['path'] ?? null;
        if (is_string($path) && $path !== '' && $path !== '/') {
            return null;
        }

        $origin = $scheme.'://'.$host;
        if (isset($parts['port'])) {
            $port = (int) $parts['port'];
            $default = $scheme === 'https' ? 443 : 80;
            if ($port !== $default) {
                $origin .= ':'.$port;
            }
        }

        return $origin;
    }
}
