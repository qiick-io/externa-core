<?php

namespace App\Support\Collections\CollectionPacks;

use App\Enums\FieldTypeEnum;

/**
 * Minimal section + rich_text blocks schema shared by pages/articles packs.
 */
final class MinimalBlocksBody
{
    /**
     * @return array{block_types: list<array{key: string, label: string, fields: list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>}>}>}
     */
    public static function settings(): array
    {
        return [
            'block_types' => [
                [
                    'key' => 'section',
                    'label' => 'Section',
                    'fields' => [
                        [
                            'name' => 'heading',
                            'type' => FieldTypeEnum::String->value,
                            'translatable' => true,
                            'settings' => [],
                        ],
                    ],
                ],
                [
                    'key' => 'rich_text',
                    'label' => 'Rich text',
                    'fields' => [
                        [
                            'name' => 'body',
                            'type' => FieldTypeEnum::Wysiwyg->value,
                            'translatable' => true,
                            'settings' => [],
                        ],
                    ],
                ],
            ],
        ];
    }
}
