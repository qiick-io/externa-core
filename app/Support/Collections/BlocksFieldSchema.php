<?php

namespace App\Support\Collections;

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Services\Collections\FieldConditionEvaluator;
use Illuminate\Support\Str;

class BlocksFieldSchema
{
    /**
     * Absolute ceiling for blocks nesting (depth 1 = collection field).
     */
    public const MAX_BLOCKS_DEPTH = 5;

    /**
     * Default max nesting when settings.max_blocks_depth is omitted.
     */
    public const DEFAULT_BLOCKS_DEPTH = 3;

    /**
     * Nested field types allowed inside a block type (leaf + optionally blocks).
     *
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
        'files',
        'many_to_one',
        'map',
        'tag',
        'hash',
        'slider',
        'autocomplete',
        'api_autocomplete',
        'code',
        'checkbox_group',
        'checkbox_group_tree',
        'm2a',
        'many_to_many',
        'one_to_many',
        'blocks',
    ];

    /**
     * Resolve effective max nesting from field settings (clamp 1–5, default 3).
     *
     * @param  array<string, mixed>|null  $settings
     */
    public static function effectiveMaxDepth(?array $settings): int
    {
        $raw = $settings['max_blocks_depth'] ?? self::DEFAULT_BLOCKS_DEPTH;

        if (! is_numeric($raw)) {
            return self::DEFAULT_BLOCKS_DEPTH;
        }

        return max(1, min(self::MAX_BLOCKS_DEPTH, (int) $raw));
    }

    /**
     * Types allowed as nested fields at a given blocks depth.
     * Strips `blocks` when depth >= maxDepth (cannot nest further).
     *
     * @return list<string>
     */
    public static function allowedNestedTypesForDepth(int $depth, ?int $maxDepth = null): array
    {
        $max = $maxDepth ?? self::DEFAULT_BLOCKS_DEPTH;

        if ($depth >= $max) {
            return array_values(array_filter(
                self::ALLOWED_NESTED_TYPES,
                static fn (string $type): bool => $type !== 'blocks',
            ));
        }

        return self::ALLOWED_NESTED_TYPES;
    }

    /**
     * @param  array<string, mixed>|null  $settings
     * @return array<string, mixed>
     */
    public function normalizeSettings(?array $settings, int $depth = 1, ?int $maxDepth = null): array
    {
        if (! is_array($settings)) {
            return [];
        }

        $incomingHadBlockTypes = array_key_exists('block_types', $settings);
        $maxDepth ??= self::effectiveMaxDepth($settings);

        $settings['block_types'] = $this->normalizeBlockTypes($settings['block_types'] ?? null, $depth, $maxDepth);

        if ($settings['block_types'] === []) {
            unset($settings['block_types']);
        }

        if ($depth === 1 && ($incomingHadBlockTypes || isset($settings['block_types']))) {
            $settings['max_blocks_depth'] = $maxDepth;
        } else {
            unset($settings['max_blocks_depth']);
        }

        return $settings;
    }

    /**
     * @return list<array{key: string, label: string, fields: list<array{name: string, type: string, translatable?: bool, settings: array<string, mixed>}>}>
     */
    public function normalizeBlockTypes(mixed $raw, int $depth = 1, ?int $maxDepth = null): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $maxDepth ??= self::DEFAULT_BLOCKS_DEPTH;
        $allowed = self::allowedNestedTypesForDepth($depth, $maxDepth);
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

                if ($name === '' || $type === '' || ! in_array($type, $allowed, true)) {
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

                $nestedSettings = is_array($field['settings'] ?? null) ? $field['settings'] : [];
                if ($type === 'blocks') {
                    // Nested blocks cannot themselves be translatable; recurse with depth+1.
                    $translatable = false;
                    $nestedSettings = $this->normalizeSettings($nestedSettings, $depth + 1, $maxDepth);
                } else {
                    $nestedSettings = $this->normalizeNestedFieldSettings($nestedSettings);
                }

                $fields[] = [
                    'name' => $name,
                    'type' => $type,
                    'translatable' => $translatable,
                    'settings' => $nestedSettings,
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
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private function normalizeNestedFieldSettings(array $settings): array
    {
        if (! array_key_exists('conditions', $settings)) {
            return $settings;
        }

        $normalized = app(FieldConditionEvaluator::class)->normalizeSettings(
            is_array($settings['conditions']) ? $settings['conditions'] : null,
        );

        if ($normalized === null) {
            unset($settings['conditions']);
        } else {
            $settings['conditions'] = $normalized;
        }

        return $settings;
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
