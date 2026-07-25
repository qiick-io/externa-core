<?php

namespace App\Support\Collections\FieldPacks;

use App\Enums\FieldTypeEnum;

/**
 * Draft / published / archived + publish date + featured flag.
 */
final class PublishingFieldPack
{
    public const KEY = 'publishing';

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
            'label' => 'Publishing',
            'description' => 'Status (draft/published/archived), published_at date, and featured flag.',
            'fields' => [
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
                    'name' => 'featured',
                    'type' => FieldTypeEnum::Boolean->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Featured'],
                    ],
                ],
            ],
        ];
    }
}
