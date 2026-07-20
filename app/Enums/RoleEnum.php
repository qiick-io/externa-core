<?php

namespace App\Enums;

/**
 * Built-in application roles.
 */
enum RoleEnum: string
{
    case SuperAdmin = 'super-admin';
    case Admin = 'admin';
    case Reader = 'reader';
    case Public = 'public';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Roles that must never be assigned to users or deleted.
     */
    public function isSystem(): bool
    {
        return $this === self::Public;
    }

    /**
     * Whether the role may be attached to users/groups.
     */
    public function isAssignable(): bool
    {
        return $this !== self::Public;
    }
}
