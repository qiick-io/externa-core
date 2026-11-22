<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * OAuth for MCP is on but Passport cannot sign or verify tokens (keys missing or unusable).
 * Surfaces as HTTP 503 with a clear message, never a 500 from league/oauth2-server.
 */
final class MissingPassportKeysException extends RuntimeException
{
    public static function make(): self
    {
        return new self(
            __('OAuth for MCP is enabled but Passport signing keys are missing. Run `php artisan passport:keys`, or set PASSPORT_PRIVATE_KEY and PASSPORT_PUBLIC_KEY.'),
        );
    }
}
