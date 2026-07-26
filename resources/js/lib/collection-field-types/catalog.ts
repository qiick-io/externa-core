/** Select option describing one collection field type in the admin UI. */
export type CollectionFieldTypeOption = {
    value: string;
    label: string;
    description?: string;
};

/** Catalog of supported collection field types with UI labels. */
export const COLLECTION_FIELD_TYPES: CollectionFieldTypeOption[] = [
    { value: 'string', label: 'Text Input', description: 'Single line text' },
    {
        value: 'autocomplete',
        label: 'Combobox (static)',
        description: 'Text input with predefined suggestion options',
    },
    {
        value: 'api_autocomplete',
        label: 'Autocomplete (API)',
        description: 'Text input with suggestions fetched from a remote URL',
    },
    {
        value: 'code',
        label: 'Codice',
        description: 'Code snippet with syntax highlighting',
    },
    {
        value: 'textarea',
        label: 'TextArea',
        description: 'Multi-line plain text',
    },
    {
        value: 'wysiwyg',
        label: 'WYSIWYG',
        description: 'Rich text stored as HTML',
    },
    {
        value: 'markdown',
        label: 'Markdown',
        description: 'Formatted text with Markdown syntax',
    },
    { value: 'tag', label: 'Tag', description: 'Comma-separated tags' },
    { value: 'number', label: 'Number', description: 'Numeric value' },
    { value: 'boolean', label: 'Toggle', description: 'On / off switch' },
    {
        value: 'date',
        label: 'Date / Time',
        description: 'Date, time, or datetime (mode in settings)',
    },
    {
        value: 'map',
        label: 'Map',
        description: 'Geographic point on OpenStreetMap (latitude / longitude)',
    },
    { value: 'color', label: 'Color Picker', description: 'Color selection' },
    {
        value: 'select',
        label: 'Select',
        description: 'Pick one option from a list',
    },
    {
        value: 'multiselect',
        label: 'Multi Select',
        description: 'Pick multiple options from a dropdown',
    },
    {
        value: 'checkbox_group',
        label: 'Checkbox Group',
        description: 'Pick multiple options with visible checkboxes',
    },
    {
        value: 'checkbox_group_tree',
        label: 'Checkbox Group Tree',
        description: 'Pick multiple options from a nested tree',
    },
    {
        value: 'radio_group',
        label: 'Radio Group',
        description: 'Pick one option with radio buttons',
    },
    {
        value: 'image',
        label: 'Image',
        description: 'Single or multiple images from the file manager',
    },
    {
        value: 'files',
        label: 'Files',
        description: 'One or more files from the file manager',
    },
    {
        value: 'blocks',
        label: 'Blocks',
        description: 'Build flexible page sections from inline block schemas',
    },
    {
        value: 'm2a',
        label: 'Costruttore (M2A)',
        description: 'Build flexible content from multiple related collections',
    },
    {
        value: 'many_to_many',
        label: 'Molti a Molti',
        description: 'Link this item to many related items (M2M)',
    },
    {
        value: 'one_to_many',
        label: 'Uno a Molti',
        description:
            'Link this item to many children in another collection (O2M)',
    },
    {
        value: 'many_to_one',
        label: 'Molti a Uno',
        description: 'Link this item to one related item (M2O)',
    },
    {
        value: 'hash',
        label: 'Fingerprint ID',
        description:
            'Auto-generated unique identifier (sha256), not a password hash',
    },
    {
        value: 'slider',
        label: 'Cursore',
        description: 'Numeric value selected with a slider control',
    },
    // Legacy aliases kept for existing fields / labels — hidden from picker groups below
    {
        value: 'file',
        label: 'File (legacy)',
        description: 'Legacy single file; prefer Files',
    },
    {
        value: 'relation',
        label: 'Relation (legacy)',
        description: 'Legacy alias for Molti a Uno',
    },
    {
        value: 'relation_many',
        label: 'Relation many (legacy)',
        description: 'Legacy multi-relation alias',
    },
    {
        value: 'relation_tree',
        label: 'Relation tree (alias)',
        description: 'Alias of Molti a Uno — no tree UI yet',
    },
];

/** Field type groupings used in the field type picker UI. */
export const COLLECTION_FIELD_TYPE_GROUPS: {
    label: string;
    types: string[];
}[] = [
    {
        label: 'Text & numbers',
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
        label: 'Selection',
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
        label: 'Relational',
        types: [
            'image',
            'files',
            'blocks',
            'm2a',
            'many_to_many',
            'one_to_many',
            'many_to_one',
            // TODO: relation_tree real tree UI — hidden until then (enum alias of M2O remains)
        ],
    },
    {
        label: 'Altro',
        types: ['hash', 'slider'],
    },
];

/**
 * @param type - Field type key
 * @returns Human-readable label, or the raw type when unknown
 */
export function fieldTypeLabel(type: string): string {
    return (
        COLLECTION_FIELD_TYPES.find((option) => option.value === type)?.label ??
        type
    );
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
        'relation',
        'relation_many',
        'many_to_one',
        'one_to_many',
        'many_to_many',
        'blocks',
        'm2a',
        'relation_tree',
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
    return [
        'relation',
        'relation_many',
        'many_to_one',
        'one_to_many',
        'many_to_many',
        'relation_tree',
    ].includes(type);
}

/**
 * Whether the relation field allows selecting many related items.
 *
 * @param type - Field type key
 * @returns Whether the relation allows selecting many related items
 */
export function fieldTypeIsMultipleRelation(type: string): boolean {
    return ['relation_many', 'one_to_many', 'many_to_many'].includes(type);
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
    return type === 'files' || type === 'file';
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
    'm2a',
    'many_to_many',
    'one_to_many',
    'relation_many',
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
 * @returns UI group label for the type picker
 */
export function fieldTypeGroupForType(type: string): string {
    for (const group of COLLECTION_FIELD_TYPE_GROUPS) {
        if (group.types.includes(type)) {
            return group.label;
        }
    }

    // Legacy aliases kept in enum but hidden from the picker.
    if (
        type === 'relation' ||
        type === 'relation_many' ||
        type === 'relation_tree' ||
        type === 'file'
    ) {
        return 'Relational';
    }

    return 'Altro';
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
        'file',
        'blocks',
        'm2a',
        'many_to_many',
        'one_to_many',
        'relation_tree',
        'many_to_one',
        'relation',
        'relation_many',
    ].includes(fieldType);
}
