<?php

namespace App\Ai\Support;

use App\Enums\FieldTypeEnum;
use App\Support\Collections\BlocksFieldSchema;

/**
 * Curated field-type cookbook for AI tools (aligned with field-types docs + BlocksFieldSchema).
 * Does not scrape markdown at runtime.
 */
final class FieldTypeCookbook
{
    /**
     * Types that need DescribeFieldTypes before create_field / update_field.
     *
     * @var list<string>
     */
    public const COMPLEX_TYPES = [
        'blocks',
        'm2a',
        'many_to_many',
        'one_to_many',
        'many_to_one',
        'map',
        'relation',
        'relation_many',
        'relation_tree',
        'files',
        'image',
        'file',
        'api_autocomplete',
        'checkbox_group_tree',
    ];

    /**
     * @return list<string>
     */
    public static function allTypeKeys(): array
    {
        return FieldTypeEnum::values();
    }

    /**
     * Resolve which types to describe.
     *
     * @param  list<string>|string|null  $types  Specific types, "all", or "complex"
     * @return list<string>
     */
    public static function resolveTypeKeys(array|string|null $types): array
    {
        if ($types === null || $types === '' || $types === []) {
            return self::COMPLEX_TYPES;
        }

        if (is_string($types)) {
            $trimmed = strtolower(trim($types));

            if ($trimmed === 'all') {
                return self::allTypeKeys();
            }

            if ($trimmed === 'complex') {
                return self::COMPLEX_TYPES;
            }

            $types = array_values(array_filter(array_map('trim', explode(',', $trimmed))));
        }

        $allowed = array_flip(self::allTypeKeys());
        $resolved = [];

        foreach ($types as $type) {
            if (! is_string($type)) {
                continue;
            }

            $key = strtolower(trim($type));

            if ($key === 'all') {
                return self::allTypeKeys();
            }

            if ($key === 'complex') {
                return self::COMPLEX_TYPES;
            }

            if (isset($allowed[$key])) {
                $resolved[] = $key;
            }
        }

        return array_values(array_unique($resolved));
    }

    /**
     * @param  list<string>  $types
     * @return array{types: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public static function describe(array $types): array
    {
        $entries = [];

        foreach ($types as $type) {
            $entry = self::entryFor($type);

            if ($entry !== null) {
                $entries[] = $entry;
            }
        }

        return [
            'types' => $entries,
            'meta' => [
                'max_blocks_depth' => BlocksFieldSchema::MAX_BLOCKS_DEPTH,
                'default_blocks_depth' => BlocksFieldSchema::DEFAULT_BLOCKS_DEPTH,
                'allowed_nested_types' => BlocksFieldSchema::ALLOWED_NESTED_TYPES,
                'complex_types' => self::COMPLEX_TYPES,
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function entryFor(string $type): ?array
    {
        $enum = FieldTypeEnum::tryFrom($type);

        if ($enum === null) {
            return null;
        }

        $base = [
            'type' => $type,
            'purpose' => self::purpose($enum),
            'translatable_supported' => $enum->supportsTranslatable(),
            'array_storage' => $enum->isArrayStorage(),
            'is_relation' => $enum->isRelationType(),
            'required_settings_keys' => self::requiredSettingsKeys($enum),
            'settings_json_example' => self::settingsExample($enum),
            'value_shape' => self::valueShape($enum),
            'common_pitfalls' => self::pitfalls($enum),
            'nested_rules' => self::nestedRules($enum),
        ];

        return $base;
    }

    private static function purpose(FieldTypeEnum $type): string
    {
        return match ($type) {
            FieldTypeEnum::String => 'Single-line text.',
            FieldTypeEnum::Autocomplete => 'Text with local suggestion list.',
            FieldTypeEnum::ApiAutocomplete => 'Text with remote suggestions from a URL.',
            FieldTypeEnum::Number => 'Numeric scalar.',
            FieldTypeEnum::Boolean => 'True/false toggle.',
            FieldTypeEnum::Textarea => 'Multi-line plain text.',
            FieldTypeEnum::Wysiwyg => 'Rich HTML (TipTap); sanitized on save.',
            FieldTypeEnum::Markdown => 'Markdown text.',
            FieldTypeEnum::Code => 'Code editor with language hint.',
            FieldTypeEnum::Select => 'Single choice from options.',
            FieldTypeEnum::Multiselect => 'Multiple choices from options.',
            FieldTypeEnum::CheckboxGroup => 'Checkbox list from options.',
            FieldTypeEnum::CheckboxGroupTree => 'Hierarchical checkbox tree.',
            FieldTypeEnum::RadioGroup => 'Radio list from options.',
            FieldTypeEnum::Date => 'Date / time / datetime (date_mode).',
            FieldTypeEnum::Map => 'GeoJSON Point or MultiPoint (geometry_mode).',
            FieldTypeEnum::Color => 'Color picker.',
            FieldTypeEnum::Tag => 'Free-form string tags.',
            FieldTypeEnum::Image => 'Single or multiple image file ids.',
            FieldTypeEnum::File => 'Single file id.',
            FieldTypeEnum::Files => 'Multiple file ids.',
            FieldTypeEnum::Relation => 'Legacy many-to-one alias (prefer many_to_one).',
            FieldTypeEnum::ManyToOne => 'Link one related item.',
            FieldTypeEnum::OneToMany => 'Link many related item ids.',
            FieldTypeEnum::ManyToMany => 'Junction objects { related_item_id, meta }.',
            FieldTypeEnum::M2a => 'Many-to-any links across collections.',
            FieldTypeEnum::Blocks => 'Inline page-builder blocks with nested field schemas.',
            FieldTypeEnum::RelationTree => 'Alias of many_to_one (no tree UI yet).',
            FieldTypeEnum::RelationMany => 'Legacy multi-relation (prefer one_to_many / many_to_many).',
            FieldTypeEnum::Hash => 'One-way hash fingerprint (not translatable).',
            FieldTypeEnum::Slider => 'Numeric slider with min/max/step.',
            FieldTypeEnum::GroupAccordion => 'Layout group: accordion with Raw section children (no data). Drop fields into sections.',
            FieldTypeEnum::GroupDetail => 'Layout group: single collapsible panel (no data).',
            FieldTypeEnum::GroupRaw => 'Layout group: nesting only, no chrome (no data). Used as accordion/tab sections.',
            FieldTypeEnum::GroupTabs => 'Layout group: tabs with Raw panel children (no data). Drop fields into panels.',
        };
    }

    /**
     * @return list<string>
     */
    private static function requiredSettingsKeys(FieldTypeEnum $type): array
    {
        return match ($type) {
            FieldTypeEnum::Blocks => ['block_types'],
            FieldTypeEnum::M2a => ['allowed_collection_ids'],
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany,
            FieldTypeEnum::Relation,
            FieldTypeEnum::RelationTree,
            FieldTypeEnum::RelationMany => ['related_collection_id'],
            FieldTypeEnum::Select,
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::RadioGroup => ['options'],
            FieldTypeEnum::ApiAutocomplete => ['url', 'text_path', 'value_path'],
            default => [],
        };
    }

    /**
     * @return array<string, mixed>|\stdClass
     */
    private static function settingsExample(FieldTypeEnum $type): array|\stdClass
    {
        return match ($type) {
            FieldTypeEnum::Blocks => [
                'max_blocks_depth' => BlocksFieldSchema::DEFAULT_BLOCKS_DEPTH,
                'block_types' => [
                    [
                        'key' => 'rich_text',
                        'label' => 'Rich text',
                        'fields' => [
                            ['name' => 'title', 'type' => 'string', 'translatable' => true, 'settings' => new \stdClass],
                            ['name' => 'body', 'type' => 'wysiwyg', 'translatable' => true, 'settings' => new \stdClass],
                        ],
                    ],
                    [
                        'key' => 'media',
                        'label' => 'Media',
                        'fields' => [
                            ['name' => 'image', 'type' => 'image', 'settings' => new \stdClass],
                            ['name' => 'caption', 'type' => 'string', 'translatable' => true, 'settings' => new \stdClass],
                        ],
                    ],
                ],
            ],
            FieldTypeEnum::M2a => [
                'allowed_collection_ids' => [2],
                'allow_duplicates' => false,
            ],
            FieldTypeEnum::ManyToMany => [
                'related_collection_id' => 1,
                'display_field' => 'title',
                'junction_fields' => [
                    ['name' => 'sort', 'type' => 'number'],
                ],
            ],
            FieldTypeEnum::OneToMany => [
                'related_collection_id' => 1,
                'display_field' => 'title',
                'layout' => 'list',
            ],
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::Relation,
            FieldTypeEnum::RelationTree => [
                'related_collection_id' => 1,
                'display_field' => 'title',
            ],
            FieldTypeEnum::RelationMany => [
                'related_collection_id' => 1,
                'display_field' => 'title',
            ],
            FieldTypeEnum::Map => [
                'geometry_mode' => 'point',
                'default_lat' => 45.46,
                'default_lng' => 9.19,
                'default_zoom' => 12,
            ],
            FieldTypeEnum::Select,
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::RadioGroup => [
                'options' => [
                    ['value' => 'draft', 'label' => 'Draft'],
                    ['value' => 'published', 'label' => 'Published'],
                ],
            ],
            FieldTypeEnum::CheckboxGroupTree => [
                'options' => [
                    [
                        'value' => 'parent',
                        'label' => 'Parent',
                        'children' => [
                            ['value' => 'child', 'label' => 'Child'],
                        ],
                    ],
                ],
                'value_combining' => 'leaf',
            ],
            FieldTypeEnum::ApiAutocomplete => [
                'url' => 'https://example.com/api/search?q={{query}}',
                'results_path' => 'data',
                'text_path' => 'name',
                'value_path' => 'id',
                'trigger' => 'debounce',
                'rate' => 300,
            ],
            FieldTypeEnum::Date => [
                'date_mode' => 'datetime',
                'include_seconds' => false,
            ],
            FieldTypeEnum::Slider => [
                'min' => 0,
                'max' => 100,
                'step' => 1,
            ],
            FieldTypeEnum::Code => [
                'language' => 'javascript',
                'line_numbers' => true,
            ],
            FieldTypeEnum::Image => [
                'allow_multiple' => false,
            ],
            FieldTypeEnum::Files => [
                'layout' => 'list',
            ],
            FieldTypeEnum::GroupAccordion => [
                'layout_width' => 'full',
                'accordion_mode' => true,
                'start' => 'closed',
            ],
            FieldTypeEnum::GroupDetail => [
                'layout_width' => 'full',
                'start' => 'open',
            ],
            FieldTypeEnum::GroupTabs => [
                'layout_width' => 'full',
                'fill_width' => false,
            ],
            FieldTypeEnum::GroupRaw => [
                'layout_width' => 'full',
            ],
            default => new \stdClass,
        };
    }

    private static function valueShape(FieldTypeEnum $type): string
    {
        return match ($type) {
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree,
            FieldTypeEnum::Tag => 'string[]',
            FieldTypeEnum::Files => 'int[] (file ids)',
            FieldTypeEnum::Image => 'int or int[] (file ids) depending on allow_multiple',
            FieldTypeEnum::File => 'int (file id)',
            FieldTypeEnum::Map => 'GeoJSON Point | MultiPoint (legacy {lat,lng} accepted on write)',
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::Relation,
            FieldTypeEnum::RelationTree => 'int (related item id)',
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::RelationMany => 'int[] (related item ids)',
            FieldTypeEnum::ManyToMany => '[{ related_item_id, meta }] (bare ints accepted on write)',
            FieldTypeEnum::M2a => '[{ related_collection_id, related_item_id }]',
            FieldTypeEnum::Blocks => '[{ id, type, data }]',
            FieldTypeEnum::Boolean => 'bool | null',
            FieldTypeEnum::Number,
            FieldTypeEnum::Slider => 'number | null',
            FieldTypeEnum::GroupAccordion,
            FieldTypeEnum::GroupDetail,
            FieldTypeEnum::GroupRaw,
            FieldTypeEnum::GroupTabs => 'none (alias / no-data — never stored)',
            default => 'string | null (or locale map when translatable)',
        };
    }

    /**
     * @return list<string>
     */
    private static function pitfalls(FieldTypeEnum $type): array
    {
        $shared = [
            'Pass settings as settings_json (JSON object string). Do not invent keys outside the cookbook or a live get.',
            'Field names must match /^[a-z][a-z0-9_]*$/.',
        ];

        $specific = match ($type) {
            FieldTypeEnum::Blocks => [
                'blocks itself is never translatable; nest translatable leaf fields instead.',
                'max_blocks_depth defaults to '.BlocksFieldSchema::DEFAULT_BLOCKS_DEPTH.', ceiling '.BlocksFieldSchema::MAX_BLOCKS_DEPTH.'.',
                'Nested m2a/many_to_many/one_to_many are JSON-embedded in block.data — no junction table.',
                'Nested types must be in BlocksFieldSchema::ALLOWED_NESTED_TYPES.',
                'Before create_field/update_field on blocks, MUST call DescribeFieldTypes for blocks.',
            ],
            FieldTypeEnum::M2a => [
                'Use allowed_collection_ids (not related_collection_id).',
                'Value shape is objects with related_collection_id + related_item_id.',
                'Not classified as isRelationType() in the enum.',
            ],
            FieldTypeEnum::ManyToMany => [
                'Prefer junction objects { related_item_id, meta }; bare ints still accepted on write.',
                'junction_fields only allow string|number|boolean mini-schema.',
            ],
            FieldTypeEnum::Map => [
                'geometry_mode is point or multipoint — no LineString/Polygon.',
                'Prefer GeoJSON; legacy {lat,lng} still accepted on write.',
            ],
            FieldTypeEnum::Hash,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany,
            FieldTypeEnum::M2a,
            FieldTypeEnum::Blocks,
            FieldTypeEnum::Relation,
            FieldTypeEnum::RelationTree,
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::GroupAccordion,
            FieldTypeEnum::GroupDetail,
            FieldTypeEnum::GroupRaw,
            FieldTypeEnum::GroupTabs => [
                'translatable is forced false for this type.',
            ],
            default => [],
        };

        return array_values(array_unique([...$shared, ...$specific]));
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function nestedRules(FieldTypeEnum $type): ?array
    {
        if ($type !== FieldTypeEnum::Blocks) {
            return null;
        }

        return [
            'max_blocks_depth' => BlocksFieldSchema::MAX_BLOCKS_DEPTH,
            'default_blocks_depth' => BlocksFieldSchema::DEFAULT_BLOCKS_DEPTH,
            'allowed_nested_types' => BlocksFieldSchema::ALLOWED_NESTED_TYPES,
            'notes' => [
                'Nested blocks inherit the root field max depth; deeper blocks types are stripped on save.',
                'Nested relations (m2a/m2m/o2m) are JSON-embedded inside block.data.',
                'Nested conditions evaluate against sibling keys in block.data, not top-level item fields.',
            ],
        ];
    }
}
