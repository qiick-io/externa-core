<?php

namespace App\Support\Collections\FieldPacks;

use App\Enums\FieldTypeEnum;

/**
 * Social profile URL fields.
 */
final class SocialFieldPack
{
    public const KEY = 'social';

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
            'label' => 'Social',
            'description' => 'Facebook, Instagram, LinkedIn, Twitter/X, and YouTube URL fields.',
            'fields' => [
                [
                    'name' => 'facebook_url',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Facebook URL'],
                    ],
                ],
                [
                    'name' => 'instagram_url',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Instagram URL'],
                    ],
                ],
                [
                    'name' => 'linkedin_url',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'LinkedIn URL'],
                    ],
                ],
                [
                    'name' => 'twitter_url',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Twitter / X URL'],
                    ],
                ],
                [
                    'name' => 'youtube_url',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'YouTube URL'],
                    ],
                ],
            ],
        ];
    }
}
