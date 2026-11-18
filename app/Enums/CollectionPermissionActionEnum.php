<?php

declare(strict_types=1);

namespace App\Enums;

use App\Policies\CollectionPolicy;

/**
 * CRUD actions for per-collection CMS API access.
 */
enum CollectionPermissionActionEnum: string
{
    case Create = 'create';
    case Read = 'read';
    case Update = 'update';
    case Delete = 'delete';

    /**
     * The {@see CollectionPolicy} ability that gates this action on a collection's items.
     */
    public function itemsAbility(): string
    {
        return match ($this) {
            self::Create => 'createItems',
            self::Read => 'viewItems',
            self::Update => 'updateItems',
            self::Delete => 'deleteItems',
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
