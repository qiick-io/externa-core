<?php

namespace App\Ai\Support\CmsImport;

/**
 * Thin Directus items → flat import row (system fields stripped, translations promoted).
 */
final class DirectusRecordShaper
{
    /** @var list<string> */
    private const SYSTEM_KEYS = [
        'user_created',
        'user_updated',
        'date_created',
        'date_updated',
    ];

    /**
     * @param  array<mixed, mixed>  $record
     * @return array<mixed, mixed>
     */
    public static function shape(array $record): array
    {
        foreach (self::SYSTEM_KEYS as $key) {
            unset($record[$key]);
        }

        $translations = $record['translations'] ?? null;
        if (! is_array($translations) || $translations === [] || ! array_is_list($translations)) {
            return $record;
        }

        $first = $translations[0] ?? null;
        if (! is_array($first)) {
            return $record;
        }

        foreach ($first as $key => $value) {
            if (! is_string($key) || $key === '' || $key === 'languages_code' || $key === 'language' || $key === 'id') {
                continue;
            }

            if (array_key_exists($key, $record)) {
                continue;
            }

            if (is_array($value) || is_object($value)) {
                continue;
            }

            $record[$key] = $value;
        }

        return $record;
    }
}
