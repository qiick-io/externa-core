<?php

namespace App\Support\Files;

/**
 * Default and allowed disks for the file manager (FILES_DISK).
 */
final class FilesDisk
{
    public static function default(): string
    {
        return (string) config('files.disk', 'assets');
    }

    /**
     * @return list<string>
     */
    public static function allowed(): array
    {
        return array_values(array_unique(array_filter([
            'assets',
            's3',
            self::default(),
        ], static fn (string $disk): bool => $disk !== '')));
    }
}
