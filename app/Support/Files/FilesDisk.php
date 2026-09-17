<?php

namespace App\Support\Files;

/**
 * Default and allowed disks for the file manager (FILES_DISK).
 */
final class FilesDisk
{
    public const PRIVATE_ASSETS = 'private_assets';

    public static function default(): string
    {
        return (string) config('files.disk', 'assets');
    }

    /**
     * Non-public local disk for effective-private file bytes (not under storage:link).
     */
    public static function privateLocal(): string
    {
        return self::PRIVATE_ASSETS;
    }

    /**
     * Whether the disk is the local public/private assets pair.
     */
    public static function isLocalAssetsFamily(string $disk): bool
    {
        return $disk === 'assets' || $disk === self::PRIVATE_ASSETS;
    }

    /**
     * Map assets ↔ private_assets from effective privacy; leave s3/custom unchanged.
     */
    public static function forEffectivePrivacy(bool $private, ?string $disk = null): string
    {
        $disk ??= self::default();

        if (! self::isLocalAssetsFamily($disk)) {
            return $disk;
        }

        return $private ? self::PRIVATE_ASSETS : 'assets';
    }

    /**
     * @return list<string>
     */
    public static function allowed(): array
    {
        return array_values(array_unique(array_filter([
            'assets',
            self::PRIVATE_ASSETS,
            's3',
            self::default(),
        ], static fn (string $disk): bool => $disk !== '')));
    }
}
