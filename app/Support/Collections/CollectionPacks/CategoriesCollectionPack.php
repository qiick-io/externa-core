<?php

namespace App\Support\Collections\CollectionPacks;

use App\Enums\FieldTypeEnum;

/**
 * Categories taxonomy collection.
 */
final class CategoriesCollectionPack
{
    public const KEY = 'categories';

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
            'label' => 'Categories',
            'description' => 'Category taxonomy: name, slug, description.',
            'collection' => [
                'name' => 'Categories',
                'slug' => 'categories',
                'is_singleton' => false,
            ],
            'fields' => [
                [
                    'name' => 'name',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => true,
                    'settings' => [
                        'display_name' => ['en' => 'Name'],
                    ],
                ],
                [
                    'name' => 'slug',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Slug'],
                    ],
                ],
                [
                    'name' => 'description',
                    'type' => FieldTypeEnum::Textarea->value,
                    'translatable' => true,
                    'settings' => [
                        'display_name' => ['en' => 'Description'],
                    ],
                ],
            ],
            'requires' => [],
            'relations' => [],
        ];
    }
}
