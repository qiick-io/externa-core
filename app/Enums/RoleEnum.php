<?php

namespace App\Enums;

enum RoleEnum: string
{
    case SuperAdmin = 'super-admin';
    case Admin = 'admin';
    case Reader = 'reader';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
