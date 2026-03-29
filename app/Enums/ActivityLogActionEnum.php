<?php

namespace App\Enums;

enum ActivityLogActionEnum: string
{
    case GET = 'GET';
    case SHOW = 'SHOW';
    case STORE = 'STORE';
    case UPDATE = 'UPDATE';
    case DESTROY = 'DESTROY';
    case DELETE = 'DELETE';
    case RESTORE = 'RESTORE';

    public function label(): string
    {
        return match ($this) {
            self::GET => 'GET',
            self::SHOW => 'SHOW',
            self::STORE => 'STORE',
            self::UPDATE => 'UPDATE',
            self::DESTROY => 'DESTROY',
            self::DELETE => 'DELETE',
            self::RESTORE => 'RESTORE',
        };
    }
}
