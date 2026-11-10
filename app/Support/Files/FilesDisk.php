<?php

namespace App\Support\Files;

/**
 * Default and allowed disks for the file manager (FILES_DISK).
 *
 * Built-in names: `assets` / `private_assets` (local), `s3`, `gcs`, `azure`.
 * Remote disks leave privacy mapping alone — object ACLs / signed URLs are
 * configured on the Flysystem driver, not by swapping disk names.
 */
final class FilesDisk
{
    public const PRIVATE_ASSETS = 'private_assets';

    /**
     * First-class remote file-manager disks (in addition to local assets).
     *
     * @var list<string>
     */
    public const REMOTE = ['s3', 'gcs', 'azure'];

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
     * Map assets ↔ private_assets from effective privacy; leave remote/custom unchanged.
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
            ...self::REMOTE,
            self::default(),
        ], static fn (string $disk): bool => $disk !== '')));
    }
}
