<?php

namespace App\Support\Collections\FieldPacks;

/**
 * Denormalized SEO fields on an existing collection (`seo_*` prefix).
 *
 * Prefer the `seo` collection pack + M2O relation for related SEO records.
 */
final class SeoInlineFieldPack
{
    public const KEY = 'seo_inline';

    /**
     * @return array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>
     * }
     */
    public static function definition(): array
    {
        return [
            'key' => self::KEY,
            'label' => 'SEO (inline)',
            'description' => 'Denormalized SEO metadata fields (`seo_*`) on the current collection. Prefer the SEO collection pack + relation when scaffolding Articles/Pages/Products.',
            'fields' => SeoFieldDefinitions::fields('seo_'),
        ];
    }
}
