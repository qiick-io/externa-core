<?php

namespace App\Enums;

/**
 * Per-key file access for the public Files API (independent of collection_slugs).
 */
enum ApiKeyFilesScopeEnum: string
{
    case None = 'none';
    case Read = 'read';
    case All = 'all';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
