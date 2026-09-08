/** Select option describing one collection field type in the admin UI. */
export type CollectionFieldTypeOption = {
    value: string;
};

type TranslateFn = (
    key: string,
    options?: { defaultValue?: string },
) => string;

/** Catalog of supported collection field types (UI copy lives in i18n). */
export const COLLECTION_FIELD_TYPES: CollectionFieldTypeOption[] = [
    { value: 'string' },
    { value: 'autocomplete' },
    { value: 'api_autocomplete' },
    { value: 'code' },
    { value: 'textarea' },
    { value: 'wysiwyg' },
    { value: 'markdown' },
    { value: 'tag' },
    { value: 'number' },
    { value: 'boolean' },
    { value: 'date' },
    { value: 'map' },
    { value: 'color' },
    { value: 'select' },
    { value: 'multiselect' },
    { value: 'checkbox_group' },
    { value: 'checkbox_group_tree' },
    { value: 'radio_group' },
    { value: 'image' },
    { value: 'files' },
    { value: 'blocks' },
    { value: 'm2a' },
    { value: 'many_to_many' },
    { value: 'one_to_many' },
    { value: 'many_to_one' },
    { value: 'hash' },
    { value: 'slider' },
    { value: 'group_accordion' },
    { value: 'group_detail' },
    { value: 'group_raw' },
    { value: 'group_tabs' },
];

/** Stable group keys used in the field type picker UI (labels via i18n). */
export const COLLECTION_FIELD_TYPE_GROUPS: {
    key: string;
    types: string[];
}[] = [
    {
        key: 'text_numbers',
        types: [
            'string',
            'autocomplete',
            'api_autocomplete',
            'code',
            'textarea',
            'wysiwyg',
            'markdown',
            'tag',
            'number',
        ],
    },
    {
        key: 'selection',
        types: [
            'boolean',
            'date',
            'map',
            'color',
            'select',
            'multiselect',
            'checkbox_group',
            'checkbox_group_tree',
            'radio_group',
        ],
    },
    {
        key: 'relational',
        types: [
            'image',
            'files',
            'blocks',
            'm2a',
            'many_to_many',
            'one_to_many',
            'many_to_one',
        ],
    },
    {
        key: 'other',
        types: ['hash', 'slider'],
    },
    {
        key: 'groups',
        types: [
            'group_accordion',
            'group_detail',
            'group_raw',
            'group_tabs',
        ],
    },
];

/** i18n key for a field type display label. */
export function fieldTypeLabelKey(type: string): string {
    return `collections.fieldTypes.${type}.label`;
}

/** i18n key for a field type description. */
export function fieldTypeDescriptionKey(type: string): string {
    return `collections.fieldTypes.${type}.description`;
}

/** i18n key for a field type group label. */
export function fieldTypeGroupLabelKey(groupKey: string): string {
    return `collections.fieldTypeGroups.${groupKey}`;
}

/**
 * @param type - Field type key
 * @param t - i18n translate function
 * @returns Localized label, or the raw type when unknown
 */
export function fieldTypeLabel(type: string, t: TranslateFn): string {
    return t(fieldTypeLabelKey(type), { defaultValue: type });
}

/**
 * @param type - Field type key
 * @param t - i18n translate function
 * @returns Localized description, or empty string when unknown
 */
export function fieldTypeDescription(type: string, t: TranslateFn): string {
    return t(fieldTypeDescriptionKey(type), { defaultValue: '' });
}

/**
 * Whether the field type requires static option configuration.
 *
 * @param type - Field type key
 * @returns Whether the type requires static option rows in settings
 */
export function fieldTypeNeedsOptions(type: string): boolean {
    return (
        type === 'select' ||
        type === 'multiselect' ||
        type === 'radio_group' ||
        type === 'autocomplete' ||
        type === 'checkbox_group' ||
        type === 'checkbox_group_tree'
    );
}

/**
 * Whether editors may mark this field as per-locale (translatable).
 * Hash fingerprints and relation IDs are shared across locales.
 *
 * @param type - Field type key
 * @returns Whether the Translatable checkbox should be shown
 */
export function fieldTypeSupportsTranslatable(type: string): boolean {
    return ![
        'hash',
        'many_to_one',
        'one_to_many',
        'many_to_many',
        'blocks',
        'm2a',
        'group_accordion',
        'group_detail',
        'group_raw',
        'group_tabs',
    ].includes(type);
}

/**
 * Whether the field type uses a nested tree option editor.
 *
 * @param type - Field type key
 * @returns Whether the type uses a nested tree option editor
 */
export function fieldTypeNeedsTreeOptions(type: string): boolean {
    return type === 'checkbox_group_tree';
}

/**
 * Whether the field type links to another collection.
 *
 * @param type - Field type key
 * @returns Whether the type links to another collection
 */
export function fieldTypeNeedsRelation(type: string): boolean {
    return ['many_to_one', 'one_to_many', 'many_to_many'].includes(type);
}

/**
 * Whether the relation field allows selecting many related items.
 *
 * @param type - Field type key
 * @returns Whether the relation allows selecting many related items
 */
export function fieldTypeIsMultipleRelation(type: string): boolean {
    return ['one_to_many', 'many_to_many'].includes(type);
}

/**
 * Whether the field type needs many-to-any (M2A) settings.
 *
 * @param type - Field type key
 * @returns Whether the type is many-to-any (M2A) builder settings
 */
export function fieldTypeNeedsM2aSettings(type: string): boolean {
    return type === 'm2a';
}

export function fieldTypeNeedsBlocksSettings(type: string): boolean {
    return type === 'blocks';
}

/**
 * Whether the field type stores one or more file references.
 *
 * @param type - Field type key
 * @returns Whether the type stores file manager references
 */
export function fieldTypeIsFilesField(type: string): boolean {
    return type === 'files';
}

/**
 * Whether the field type stores image file references.
 *
 * @param type - Field type key
 * @returns Whether the type is an image picker field
 */
export function fieldTypeIsImageField(type: string): boolean {
    return type === 'image';
}

/**
 * Field Type Needs Slider Settings.
 *
 * @param type - Field type key
 * @returns Whether the type exposes slider min/max/step settings
 */
export function fieldTypeNeedsSliderSettings(type: string): boolean {
    return type === 'slider';
}

/** Numeric bounds and defaults for slider field settings. */
export type SliderFieldSettings = {
    min: number;
    max: number;
    step: number;
    defaultValue: number;
};

/** Flat select/radio option row stored in field settings. */
export type FieldOptionRow = { value: string; label: string };

/** Nested option row for checkbox tree fields. */
export type FieldTreeOptionRow = FieldOptionRow & {
    children?: FieldTreeOptionRow[];
};

/** Lightweight collection reference for relation field pickers. */
export type RelatedCollectionOption = {
    id: number;
    name: string;
    slug: string;
};

/** Storage / input subtype for text input fields (saved in settings.input_type). */
export const STRING_INPUT_TYPES: { value: string; label: string }[] = [
    { value: 'string', label: 'String' },
    { value: 'text', label: 'Text' },
    { value: 'integer', label: 'Integer' },
    { value: 'bigInteger', label: 'Big Integer' },
    { value: 'float', label: 'Float' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'uuid', label: 'UUID' },
];

/**
 * @param type - Field type key
 * @returns Whether the type exposes string input subtype settings
 */
export function fieldTypeUsesStringInputSettings(type: string): boolean {
    return type === 'string';
}

export type BlocksFieldDefinition = {
    name: string;
    type: string;
    translatable: boolean;
    settings: Record<string, unknown>;
};

export type BlocksTypeDefinition = {
    key: string;
    label: string;
    fields: BlocksFieldDefinition[];
};

/** Matches BlocksFieldSchema::MAX_BLOCKS_DEPTH — absolute ceiling. Depth 1 = collection field. */
export const MAX_BLOCKS_DEPTH = 5;

/** Matches BlocksFieldSchema::DEFAULT_BLOCKS_DEPTH when settings omit max_blocks_depth. */
export const DEFAULT_BLOCKS_DEPTH = 3;

export const BLOCKS_ALLOWED_FIELD_TYPES = [
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
] as const;

/** Resolve effective max nesting from field settings (clamp 1–5, default 3). */
export function effectiveMaxBlocksDepth(
    settings?: Record<string, unknown> | null,
): number {
    const raw = settings?.max_blocks_depth;
    const n =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
              ? Number(raw)
              : DEFAULT_BLOCKS_DEPTH;

    if (!Number.isFinite(n)) {
        return DEFAULT_BLOCKS_DEPTH;
    }

    return Math.max(1, Math.min(MAX_BLOCKS_DEPTH, Math.trunc(n)));
}

/** Nested field types allowed at a given blocks depth (blocks only when depth < maxDepth). */
export function blocksAllowedFieldTypesForDepth(
    depth: number,
    maxDepth: number = DEFAULT_BLOCKS_DEPTH,
): readonly string[] {
    if (depth >= maxDepth) {
        return BLOCKS_ALLOWED_FIELD_TYPES.filter((type) => type !== 'blocks');
    }

    return BLOCKS_ALLOWED_FIELD_TYPES;
}

/**
 * Field Type Group For Type.
 *
 * @param type - Field type key
 * @returns Stable group key for the type picker (e.g. selection, other)
 */
export function fieldTypeGroupForType(type: string): string {
    for (const group of COLLECTION_FIELD_TYPE_GROUPS) {
        if (group.types.includes(type)) {
            return group.key;
        }
    }

    return 'other';
}

/**
 * Supports Default Value.
 *
 * @param fieldType - Field type key
 * @returns Whether the type supports a default value in settings
 */
export function supportsDefaultValue(fieldType: string): boolean {
    return ![
        'hash',
        'image',
        'files',
        'blocks',
        'm2a',
        'many_to_many',
        'one_to_many',
        'many_to_one',
        // Slider owns numeric default in type settings; common text default was dead.
        'slider',
        'group_accordion',
        'group_detail',
        'group_raw',
        'group_tabs',
    ].includes(fieldType);
}

/** Whether the type is a layout group (alias / no-data container). */
export function fieldTypeIsLayoutGroup(type: string): boolean {
    return (
        type === 'group_accordion' ||
        type === 'group_detail' ||
        type === 'group_raw' ||
        type === 'group_tabs'
    );
}
