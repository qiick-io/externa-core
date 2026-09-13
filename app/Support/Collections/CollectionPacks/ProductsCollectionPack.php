<?php

namespace App\Support\Collections\CollectionPacks;

use App\Enums\FieldTypeEnum;

/**
 * Products collection with category + SEO relations.
 */
final class ProductsCollectionPack
{
    public const KEY = 'products';

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
            'label' => 'Products',
            'description' => 'Products with price, images, category and SEO relations. Auto-creates Categories + SEO packs if missing.',
            'collection' => [
                'name' => 'Products',
                'slug' => 'products',
                'is_singleton' => false,
            ],
            'fields' => [
                [
                    'name' => 'title',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => true,
                    'settings' => [
                        'display_name' => ['en' => 'Title'],
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
                [
                    'name' => 'price',
                    'type' => FieldTypeEnum::Number->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Price'],
                    ],
                ],
                [
                    'name' => 'images',
                    'type' => FieldTypeEnum::Files->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Images'],
                    ],
                ],
                [
                    'name' => 'status',
                    'type' => FieldTypeEnum::Select->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Status'],
                        'options' => [
                            ['value' => 'draft', 'label' => 'Draft'],
                            ['value' => 'published', 'label' => 'Published'],
                            ['value' => 'archived', 'label' => 'Archived'],
                        ],
                    ],
                ],
            ],
            'requires' => [SeoCollectionPack::KEY, CategoriesCollectionPack::KEY],
            'relations' => [
                [
                    'field_name' => 'category',
                    'type' => FieldTypeEnum::ManyToOne->value,
                    'related_pack' => CategoriesCollectionPack::KEY,
                    'display_field' => 'name',
                ],
                [
                    'field_name' => 'seo',
                    'type' => FieldTypeEnum::ManyToOne->value,
                    'related_pack' => SeoCollectionPack::KEY,
                    'display_field' => 'title',
                ],
            ],
        ];
    }
}
