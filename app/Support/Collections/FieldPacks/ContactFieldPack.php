<?php

namespace App\Support\Collections\FieldPacks;

use App\Enums\FieldTypeEnum;

/**
 * Basic contact / address fields.
 */
final class ContactFieldPack
{
    public const KEY = 'contact';

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
            'label' => 'Contact',
            'description' => 'Email, phone, and postal address fields.',
            'fields' => [
                [
                    'name' => 'email',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Email'],
                    ],
                ],
                [
                    'name' => 'phone',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Phone'],
                    ],
                ],
                [
                    'name' => 'address',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Address'],
                    ],
                ],
                [
                    'name' => 'city',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'City'],
                    ],
                ],
                [
                    'name' => 'postal_code',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Postal code'],
                    ],
                ],
                [
                    'name' => 'country',
                    'type' => FieldTypeEnum::String->value,
                    'translatable' => false,
                    'settings' => [
                        'display_name' => ['en' => 'Country'],
                    ],
                ],
            ],
        ];
    }
}
