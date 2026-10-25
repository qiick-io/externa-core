<?php

namespace App\Enums;

/**
 * Visibility of a file/folder for the public CMS API.
 * Stored null on the row means inherit from the nearest ancestor override.
 */
enum FileAccess: string
{
    case Public = 'public';
    case Private = 'private';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
