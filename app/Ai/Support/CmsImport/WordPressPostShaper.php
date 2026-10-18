<?php

namespace App\Ai\Support\CmsImport;

/**
 * Thin WordPress REST post → flat import row (unwrap *.rendered envelopes).
 */
final class WordPressPostShaper
{
    /**
     * @param  array<mixed, mixed>  $record
     * @return array<mixed, mixed>
     */
    public static function shape(array $record): array
    {
        foreach ($record as $key => $value) {
            if (! is_string($key) || ! is_array($value)) {
                continue;
            }

            if (array_key_exists('rendered', $value) && is_scalar($value['rendered'])) {
                $record[$key] = (string) $value['rendered'];
            }
        }

        return $record;
    }
}
