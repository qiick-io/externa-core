<?php

namespace App\Support\Collections\CollectionPacks;

use App\Enums\FieldTypeEnum;

/**
 * Pages collection with body blocks and M2O → SEO.
 */
final class PagesCollectionPack
{
    public const KEY = 'pages';

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
            'label' => 'Pages',
            'description' => 'Pages with title, slug, status, body blocks, and SEO relation. Auto-creates the SEO pack if missing.',
            'collection' => [
                'name' => 'Pages',
                'slug' => 'pages',
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
                [
                    'name' => 'published_at',
                    'type' => FieldTypeEnum::Date->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Published at'],
                    ],
                ],
                [
                    'name' => 'body',
                    'type' => FieldTypeEnum::Blocks->value,
                    'translatable' => false,
                    'settings' => MinimalBlocksBody::settings(),
                ],
            ],
            'requires' => [SeoCollectionPack::KEY],
            'relations' => [
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
