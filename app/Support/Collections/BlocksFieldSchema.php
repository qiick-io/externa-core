<?php

namespace App\Support\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use Illuminate\Support\Str;

class BlocksFieldSchema
{
    /**
     * @var list<string>
     */
    public const ALLOWED_NESTED_TYPES = [
        'string',
        'textarea',
        'wysiwyg',
        'markdown',
        'number',
        'boolean',
        'date',
        'color',
        'select',
        'multiselect',
        'radio_group',
        'image',
        'file',
        'files',
        'many_to_one',
        'relation',
        'map',
        'tag',
        'hash',
        'slider',
        'autocomplete',
        'api_autocomplete',
        'code',
        'checkbox_group',
        'checkbox_group_tree',
    ];

    /**
     * @param  array<string, mixed>|null  $settings
     * @return array<string, mixed>
     */
    public function normalizeSettings(?array $settings): array
    {
        if (! is_array($settings)) {
            return [];
        }

        $settings['block_types'] = $this->normalizeBlockTypes($settings['block_types'] ?? null);

        if ($settings['block_types'] === []) {
            unset($settings['block_types']);
        }

        return $settings;
    }

    /**
     * @return list<array{key: string, label: string, fields: list<array{name: string, type: string, translatable?: bool, settings: array<string, mixed>}>}>
     */
    public function normalizeBlockTypes(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $out = [];

        foreach ($raw as $blockType) {
            if (! is_array($blockType)) {
                continue;
            }

            $key = Str::of((string) ($blockType['key'] ?? ''))->trim()->slug('_')->value();
            $label = trim((string) ($blockType['label'] ?? ''));

            $fields = [];
            foreach (($blockType['fields'] ?? []) as $field) {
                if (! is_array($field)) {
                    continue;
                }

                $name = Str::of((string) ($field['name'] ?? ''))->trim()->snake()->value();
                $type = (string) ($field['type'] ?? '');

                if ($name === '' || $type === '' || ! in_array($type, self::ALLOWED_NESTED_TYPES, true)) {
                    continue;
                }

                $fieldType = FieldTypeEnum::tryFrom($type);
                // Form flatten sends "0"/"1"; (bool)"false" would wrongly become true.
                $rawTranslatable = $field['translatable'] ?? false;
                $translatable = $rawTranslatable === true
                    || $rawTranslatable === 1
                    || $rawTranslatable === '1'
                    || $rawTranslatable === 'true';
                if ($fieldType !== null && ! $fieldType->supportsTranslatable()) {
                    $translatable = false;
                }

                $fields[] = [
                    'name' => $name,
                    'type' => $type,
                    'translatable' => $translatable,
                    'settings' => is_array($field['settings'] ?? null) ? $field['settings'] : [],
                ];
            }

            if ($key === '' || $label === '') {
                continue;
            }

            $out[] = [
                'key' => $key,
                'label' => $label,
                'fields' => $fields,
            ];
        }

        return $out;
    }

    /**
     * @return array<string, array{key: string, label: string, fields: list<array{name: string, type: string, translatable?: bool, settings: array<string, mixed>}>}>
     */
    public function blockTypeMap(CollectionField $field): array
    {
        $map = [];

        foreach ($this->normalizeBlockTypes(data_get($field->settings, 'block_types')) as $blockType) {
            $map[$blockType['key']] = $blockType;
        }

        return $map;
    }

    /**
     * @param  array{name: string, type: string, translatable?: bool, settings?: array<string, mixed>}  $definition
     */
    public function toFieldDefinition(array $definition): CollectionField
    {
        $field = new CollectionField;
        $field->name = $definition['name'];
        $field->type = FieldTypeEnum::from($definition['type']);
        $field->translatable = (bool) ($definition['translatable'] ?? false);
        $field->settings = is_array($definition['settings'] ?? null) ? $definition['settings'] : [];

        return $field;
    }
}
