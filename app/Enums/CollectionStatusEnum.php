<?php

namespace App\Enums;

/**
 * Collection availability in content navigation and relation pickers.
 *
 * Inactive collections stay editable in the collections admin but are hidden
 * from nav-style lists (relation pickers, public API collection index, GraphQL list).
 */
enum CollectionStatusEnum: string
{
    case Active = 'active';
    case Inactive = 'inactive';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
