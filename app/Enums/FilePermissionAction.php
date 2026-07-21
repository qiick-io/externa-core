<?php

namespace App\Enums;

/**
 * CRUD actions for global CMS API file access (role-level, not per-folder).
 */
enum FilePermissionAction: string
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
