<?php

namespace App\Ai\Support\CmsImport;

/**
 * Named CMS import profiles that reshape records before flatten/import.
 */
final class CmsImportProfiles
{
    /** @var list<string> */
    public const SUPPORTED = ['directus', 'wordpress'];

    public static function normalize(?string $profile): ?string
    {
        $normalized = strtolower(trim((string) $profile));

        if ($normalized === '' || $normalized === 'none') {
            return null;
        }

        return $normalized;
    }

    public static function isSupported(?string $profile): bool
    {
        $normalized = self::normalize($profile);

        return $normalized === null || in_array($normalized, self::SUPPORTED, true);
    }

    /**
     * @param  array<mixed, mixed>  $record
     * @return array<mixed, mixed>
     */
    public static function shape(?string $profile, array $record): array
    {
        return match (self::normalize($profile)) {
            'directus' => DirectusRecordShaper::shape($record),
            'wordpress' => WordPressPostShaper::shape($record),
            default => $record,
        };
    }
}
