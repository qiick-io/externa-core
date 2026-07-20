<?php

namespace App\Enums;

/**
 * CRUD actions for per-collection CMS API access.
 */
enum CollectionPermissionAction: string
{
    case Create = 'create';
    case Read = 'read';
    case Update = 'update';
    case Delete = 'delete';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
