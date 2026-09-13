<?php

namespace App\Support\Collections\FieldPacks;

use App\Enums\FieldTypeEnum;

/**
 * Shared SEO field shapes for the `seo` collection pack (short names)
 * and the `seo_inline` field pack (`seo_*` prefix).
 */
final class SeoFieldDefinitions
{
    /**
     * @return list<array{name: string, type: string, translatable: bool, settings: array<string, mixed>|null}>
     */
    public static function fields(string $namePrefix = ''): array
    {
        return [
            [
                'name' => $namePrefix.'title',
                'type' => FieldTypeEnum::String->value,
                'translatable' => true,
                'settings' => [
                    'display_name' => ['en' => 'SEO title'],
                ],
            ],
            [
                'name' => $namePrefix.'description',
                'type' => FieldTypeEnum::Textarea->value,
                'translatable' => true,
                'settings' => [
                    'display_name' => ['en' => 'SEO description'],
                ],
            ],
            [
                'name' => $namePrefix.'keywords',
                'type' => FieldTypeEnum::String->value,
                'translatable' => true,
                'settings' => [
                    'display_name' => ['en' => 'Keywords'],
                ],
            ],
            [
                'name' => $namePrefix.'alternate',
                'type' => FieldTypeEnum::String->value,
                'translatable' => true,
                'settings' => [
                    'display_name' => ['en' => 'Alternate path'],
                ],
            ],
            [
                'name' => $namePrefix.'canonical',
                'type' => FieldTypeEnum::String->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Canonical URL'],
                ],
            ],
            [
                'name' => $namePrefix.'robots',
                'type' => FieldTypeEnum::Select->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Robots'],
                    'options' => [
                        ['value' => 'index, follow', 'label' => 'Index, follow'],
                        ['value' => 'index, nofollow', 'label' => 'Index, nofollow'],
                        ['value' => 'noindex, follow', 'label' => 'Noindex, follow'],
                        ['value' => 'noindex, nofollow', 'label' => 'Noindex, nofollow'],
                        ['value' => 'no-index, no-follow', 'label' => 'No-index, no-follow'],
                    ],
                ],
            ],
            [
                'name' => $namePrefix.'noindex',
                'type' => FieldTypeEnum::Boolean->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'No index'],
                ],
            ],
            [
                'name' => $namePrefix.'og_image',
                'type' => FieldTypeEnum::Image->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'OG image'],
                ],
            ],
            [
                'name' => $namePrefix.'facebook_image',
                'type' => FieldTypeEnum::Image->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Facebook image'],
                ],
            ],
            [
                'name' => $namePrefix.'twitter_image',
                'type' => FieldTypeEnum::Image->value,
                'translatable' => false,
                'settings' => [
                    'display_name' => ['en' => 'Twitter image'],
                ],
            ],
        ];
    }
}
