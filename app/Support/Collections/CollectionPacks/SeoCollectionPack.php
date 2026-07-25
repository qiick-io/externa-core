<?php

namespace App\Support\Collections\CollectionPacks;

use App\Support\Collections\FieldPacks\SeoFieldDefinitions;

/**
 * Standalone SEO entity collection: short field names, no `seo_` prefix.
 */
final class SeoCollectionPack
{
    public const KEY = 'seo';

    /**
     * @return array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     collection: array{name: string, slug: string, is_singleton: bool},
     *     fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>,
     *     requires: list<string>,
     *     relations: list<array{field_name: string, type: string, related_pack?: string, related_slug?: string, display_field?: string}>
     * }
     */
    public static function definition(): array
    {
        return [
            'key' => self::KEY,
            'label' => 'SEO',
            'description' => 'Dedicated SEO collection (title, description, robots, social images). Link from Articles/Pages/Products via M2O.',
            'collection' => [
                'name' => 'SEO',
                'slug' => 'seo',
                'is_singleton' => false,
            ],
            'fields' => SeoFieldDefinitions::fields(''),
            'requires' => [],
            'relations' => [],
        ];
    }
}
