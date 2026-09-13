<?php

namespace App\Support\Uploads;

use Illuminate\Validation\ValidationException;

/**
 * Denylist dangerous upload / rename extensions (last segment wins).
 */
final class ForbiddenUploadExtension
{
    /**
     * @var list<string>
     */
    private const FORBIDDEN = [
        'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php6', 'php7', 'php8', 'pht',
        'exe', 'bat', 'cmd', 'com', 'msi', 'scr',
        'js', 'mjs', 'vbs', 'wsf', 'hta', 'cgi', 'pl',
        'asp', 'aspx', 'jsp',
        'sh', 'bash', 'ps1',
        'dll', 'so',
    ];

    public static function isForbidden(string $fileName): bool
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        return $extension !== '' && in_array($extension, self::FORBIDDEN, true);
    }

    /**
     * @throws ValidationException
     */
    public static function assertAllowed(string $fileName, string $field = 'file'): void
    {
        if (self::isForbidden($fileName)) {
            throw ValidationException::withMessages([
                $field => ['This file type is not allowed.'],
            ]);
        }
    }
}
