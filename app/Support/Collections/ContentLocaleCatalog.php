<?php

namespace App\Support\Collections;

/**
 * Static Directus-style content locale catalog (code → name → flag region).
 */
class ContentLocaleCatalog
{
    /**
     * @var list<array{code: string, name: string, flag: string}>|null
     */
    private static ?array $entries = null;

    /**
     * @return list<array{code: string, name: string, flag: string}>
     */
    public static function all(): array
    {
        if (self::$entries !== null) {
            return self::$entries;
        }

        $path = resource_path('data/content-locales-catalog.json');
        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded)) {
            return self::$entries = [];
        }

        $entries = [];
        foreach ($decoded as $row) {
            if (
                ! is_array($row)
                || ! is_string($row['code'] ?? null)
                || ! is_string($row['name'] ?? null)
                || ! is_string($row['flag'] ?? null)
            ) {
                continue;
            }
            $entries[] = [
                'code' => $row['code'],
                'name' => $row['name'],
                'flag' => $row['flag'],
            ];
        }

        return self::$entries = $entries;
    }

    /**
     * @return list<string>
     */
    public static function codes(): array
    {
        return array_column(self::all(), 'code');
    }

    public static function isKnown(string $code): bool
    {
        return in_array($code, self::codes(), true);
    }

    /**
     * @param  list<string>  $codes
     * @return list<array{code: string, name: string, flag: string}>
     */
    public static function metaFor(array $codes): array
    {
        $byCode = [];
        foreach (self::all() as $entry) {
            $byCode[$entry['code']] = $entry;
        }

        $out = [];
        foreach ($codes as $code) {
            $out[] = $byCode[$code] ?? [
                'code' => $code,
                'name' => $code,
                'flag' => strtoupper(strlen($code) === 2 ? $code : (explode('-', $code)[1] ?? 'UN')),
            ];
        }

        return $out;
    }
}
