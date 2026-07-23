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
    { value: 'code', label: 'Codice', description: 'Code snippet with syntax highlighting' },
    { value: 'textarea', label: 'TextArea', description: 'Multi-line plain text' },
    {
        value: 'wysiwyg',
        label: 'WYSIWYG',
        description: 'Rich text stored as HTML',
    },
    { value: 'markdown', label: 'Markdown', description: 'Formatted text with Markdown syntax' },
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
    { value: 'select', label: 'Select', description: 'Pick one option from a list' },
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
        description: 'Link this item to many children in another collection (O2M)',
    },
    {
        value: 'many_to_one',
        label: 'Molti a Uno',
        description: 'Link this item to one related item (M2O)',
    },
    {
        value: 'hash',
        label: 'Fingerprint ID',
        description: 'Auto-generated unique identifier (sha256), not a password hash',
    },
    {
        value: 'slider',
        label: 'Cursore',
        description: 'Numeric value selected with a slider control',
    },
    // Legacy aliases kept for existing fields / labels — hidden from picker groups below
    { value: 'file', label: 'File (legacy)', description: 'Legacy single file; prefer Files' },
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
    return COLLECTION_FIELD_TYPES.find((option) => option.value === type)?.label ?? type;
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

/**
 * @param settings - Raw field settings object
 * @returns Normalized slider min, max, step, and default value
 */
export function parseSliderSettings(
    settings?: Record<string, unknown> | null,
): SliderFieldSettings {
    const min = Number(settings?.min ?? 0);
    const max = Number(settings?.max ?? 100);
    const step = Number(settings?.step ?? 1);
    const defaultValue = Number(settings?.default_value ?? min);

    return {
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 100,
        step: Number.isFinite(step) && step > 0 ? step : 1,
        defaultValue: Number.isFinite(defaultValue) ? defaultValue : 0,
    };
}

/**
 * Whether an image field is configured for multiple images.
 *
 * @param settings - Raw field settings object
 * @returns Whether multiple images are allowed
 */
export function isImageFieldMultiple(
    settings?: Record<string, unknown> | null,
): boolean {
    const value = settings?.allow_multiple;

    return value === true || value === 1 || value === '1';
}

/**
 * Parse allowed related collection IDs from field settings.
 *
 * @param settings - Raw M2A field settings
 * @returns Allowed related collection ids
 */
export function parseAllowedCollectionIds(
    settings?: Record<string, unknown> | null,
): number[] {
    const raw = settings?.allowed_collection_ids;

    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0);
}

/** Flat select/radio option row stored in field settings. */
export type FieldOptionRow = { value: string; label: string };

/** Nested option row for checkbox tree fields. */
export type FieldTreeOptionRow = FieldOptionRow & {
    children?: FieldTreeOptionRow[];
};

/**
 * @param settings - Raw field settings
 * @returns Option rows, or a single empty row when none configured
 */
export function parseFieldOptions(
    settings?: Record<string, unknown> | null,
): FieldOptionRow[] {
    const raw = settings?.options;

    if (!Array.isArray(raw) || raw.length === 0) {
        return [{ value: '', label: '' }];
    }

    return raw.map((row) => {
        const option = row as { value?: unknown; label?: unknown };

        return {
            value: String(option.value ?? ''),
            label: String(option.label ?? option.value ?? ''),
        };
    });
}

/**
 * Parse nested tree options from field settings.
 *
 * @param settings - Raw field settings
 * @returns Tree option nodes, or a single empty root when none configured
 */
export function parseFieldTreeOptions(
    settings?: Record<string, unknown> | null,
): FieldTreeOptionRow[] {
    const raw = settings?.options;

    if (!Array.isArray(raw) || raw.length === 0) {
        return [{ value: '', label: '', children: [] }];
    }

    const parseNode = (row: unknown): FieldTreeOptionRow => {
        const option = row as {
            value?: unknown;
            label?: unknown;
            children?: unknown;
        };
        const children = Array.isArray(option.children)
            ? option.children.map(parseNode)
            : [];

        return {
            value: String(option.value ?? ''),
            label: String(option.label ?? option.value ?? ''),
            children,
        };
    };

    return raw.map(parseNode);
}

/**
 * Flattens a tree option list into value/label pairs (depth-first).
 *
 * @param options - Tree nodes to flatten
 * @returns Flat option rows including all descendants
 */
export function flattenFieldTreeOptions(
    options: FieldTreeOptionRow[],
): FieldOptionRow[] {
    const flattened: FieldOptionRow[] = [];

    for (const option of options) {
        flattened.push({ value: option.value, label: option.label });

        if (option.children !== undefined && option.children.length > 0) {
            flattened.push(...flattenFieldTreeOptions(option.children));
        }
    }

    return flattened;
}

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

/**
 * Whether the field is marked required in its settings.
 *
 * @param settings - Raw field settings
 * @returns Whether the field is required in forms
 */
export function isFieldRequired(settings?: Record<string, unknown> | null): boolean {
    const value = settings?.required;

    return value === true || value === 1 || value === '1';
}

/**
 * Whether the field should be hidden on item forms.
 *
 * @param settings - Raw field settings
 * @returns Whether the field is hidden on item edit forms
 */
export function isFieldHiddenInForm(
    settings?: Record<string, unknown> | null,
): boolean {
    const value = settings?.hidden_in_form;

    return value === true || value === 1 || value === '1';
}

/**
 * Filter fields to those visible on the item form.
 *
 * @param fields - Field definitions with optional settings
 * @returns Fields that should render on item edit forms
 */
export function fieldsVisibleInForm<T extends { settings?: Record<string, unknown> | null }>(
    fields: T[],
): T[] {
    return fields.filter((field) => !isFieldHiddenInForm(field.settings));
}

/** Grid column width token for collection field layout. */
export type FieldLayoutWidth = 'half' | 'full' | 'fill';

/** Selectable layout width options for field settings UI. */
export const FIELD_LAYOUT_WIDTH_OPTIONS: {
    value: FieldLayoutWidth;
    label: string;
}[] = [
    { value: 'half', label: 'Metà larghezza' },
    { value: 'full', label: 'Larghezza massima' },
    { value: 'fill', label: 'Riempi larghezza' },
];

/**
 * @param settings - Raw field settings
 * @returns Layout width token, defaulting to `full`
 */
export function getFieldLayoutWidth(
    settings?: Record<string, unknown> | null,
): FieldLayoutWidth {
    const value = settings?.layout_width;

    if (value === 'half' || value === 'fill' || value === 'full') {
        return value;
    }

    return 'full';
}

/**
 * Human-readable label for a field layout width.
 *
 * @param width - Layout width token
 * @returns Localized label for the width option
 */
export function fieldLayoutWidthLabel(width: FieldLayoutWidth): string {
    return (
        FIELD_LAYOUT_WIDTH_OPTIONS.find((option) => option.value === width)
            ?.label ?? 'Larghezza massima'
    );
}

/**
 * Whether the field should start a new layout row.
 *
 * @param settings - Raw field settings
 * @returns Whether this field forces a new grid row before rendering
 */
export function fieldStartsNewLayoutRow(
    settings?: Record<string, unknown> | null,
): boolean {
    const value = settings?.layout_starts_new_row;

    return value === true || value === 1 || value === '1';
}

/** One field placed on a layout row with its computed column span. */
export type FieldLayoutRowItem<T> = {
    field: T;
    colSpan: 1 | 2;
};

/**
 * Computes grid column span (1 or 2) for each field in sort order.
 * Used by both the schema list and item form layouts.
 *
 * @param fields - Ordered field definitions
 * @returns Column span per field index
 */
export function getFieldGridColSpans<T extends { settings?: Record<string, unknown> | null }>(
    fields: T[],
): (1 | 2)[] {
    const colSpans: (1 | 2)[] = [];
    let awaitingHalfPartner = false;

    for (const field of fields) {
        if (fieldStartsNewLayoutRow(field.settings)) {
            awaitingHalfPartner = false;
        }

        const layoutWidth = getFieldLayoutWidth(field.settings);

        if (layoutWidth === 'full') {
            awaitingHalfPartner = false;
            colSpans.push(2);

            continue;
        }

        if (layoutWidth === 'half') {
            if (awaitingHalfPartner) {
                colSpans.push(1);
                awaitingHalfPartner = false;
            } else {
                colSpans.push(1);
                awaitingHalfPartner = true;
            }

            continue;
        }

        if (awaitingHalfPartner) {
            colSpans.push(1);
            awaitingHalfPartner = false;
        } else {
            colSpans.push(2);
        }
    }

    return colSpans;
}

/**
 * Groups ordered fields into grid rows. Full-width fields always start a new row.
 * Half-width fields pair on one row; fill completes a row opened by a half field.
 *
 * @param fields - Ordered field definitions
 * @returns Rows of fields with column spans
 */
export function groupFieldsIntoLayoutRows<T extends { settings?: Record<string, unknown> | null }>(
    fields: T[],
): FieldLayoutRowItem<T>[][] {
    const colSpans = getFieldGridColSpans(fields);
    const rows: FieldLayoutRowItem<T>[][] = [];
    let currentRow: FieldLayoutRowItem<T>[] = [];
    let currentRowColumns = 0;

    fields.forEach((field, index) => {
        const colSpan = colSpans[index] ?? 2;

        if (fieldStartsNewLayoutRow(field.settings) && currentRow.length > 0) {
            rows.push(currentRow);
            currentRow = [];
            currentRowColumns = 0;
        }

        currentRow.push({ field, colSpan });
        currentRowColumns += colSpan;

        if (currentRowColumns >= 2) {
            rows.push(currentRow);
            currentRow = [];
            currentRowColumns = 0;
        }
    });

    if (currentRow.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

/**
 * Parse string-input settings from a field settings blob.
 *
 * @param settings - Raw string field settings
 * @returns Input subtype, default value, and required flag for forms
 */
export function parseStringInputSettings(settings?: Record<string, unknown> | null): {
    inputType: string;
    defaultValue: string;
    required: boolean;
} {
    const stringSettings = parseStringFieldSettings(settings);

    return {
        inputType: stringSettings.inputType,
        defaultValue: stringSettings.defaultValue,
        required: isFieldRequired(settings),
    };
}

/** Seed fallback when shared collectionLocales are unavailable. */
export const COLLECTION_FIELD_LOCALES = ['en', 'it'] as const;
export type CollectionFieldLocale = string;

/** Partial map of locale code to translated string. */
export type TranslatedText = Partial<Record<string, string>>;

/** Validation operators available in the field rule builder. */
export const FIELD_VALIDATION_OPERATORS = [
    { value: 'required', label: 'Required', needsValue: false },
    { value: 'unique', label: 'Unique', needsValue: false },
    { value: 'min_length', label: 'Min length', needsValue: true },
    { value: 'max_length', label: 'Max length', needsValue: true },
    { value: 'min', label: 'Min value', needsValue: true },
    { value: 'max', label: 'Max value', needsValue: true },
    { value: 'regex', label: 'Regex', needsValue: true },
    { value: 'contains', label: 'Contains', needsValue: true },
    { value: 'not_contains', label: 'Does not contain', needsValue: true },
    { value: 'equals', label: 'Equals', needsValue: true },
    { value: 'not_equals', label: 'Does not equal', needsValue: true },
] as const;

/** Supported validation operator keys for the field rule builder. */
export type FieldValidationOperator =
    (typeof FIELD_VALIDATION_OPERATORS)[number]['value'];

/** Single validation rule stored in field settings. */
export type FieldValidationRule = {
    operator: FieldValidationOperator;
    value?: string | number;
};

/** Cross-cutting field settings shared by all field types. */
export type CommonFieldSettings = {
    displayName: TranslatedText;
    note: TranslatedText;
    required: boolean;
    readonly: boolean;
    hiddenInForm: boolean;
    defaultValue: unknown;
    validationRules: FieldValidationRule[];
    validationMessage: TranslatedText;
};

function settingsFlag(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}

/**
 * @param raw - Stored translated text object
 * @returns Normalized locale map with non-empty strings only
 */
export function parseTranslatedText(
    raw: unknown,
): TranslatedText {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }

    const record = raw as Record<string, unknown>;
    const out: TranslatedText = {};

    for (const [locale, value] of Object.entries(record)) {
        if (typeof value === 'string' && value.trim() !== '') {
            out[locale] = value;
        }
    }

    return out;
}

/**
 * Serialize translated text for persistence in field settings.
 *
 * @param text - In-memory translated text map
 * @returns Storage object, or undefined when all locales are empty
 */
export function serializeTranslatedText(
    text: TranslatedText,
): Record<string, string> | undefined {
    const out: Record<string, string> = {};

    for (const [locale, raw] of Object.entries(text)) {
        const value = raw?.trim();

        if (value) {
            out[locale] = value;
        }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Picks the first non-empty translation for preferred locales, then any key.
 *
 * @param text - Translated text map
 * @param locales - Preferred locale order
 * @param fallback - Value when no translation exists
 * @returns Resolved display string
 */
export function resolveTranslatedText(
    text: TranslatedText | undefined,
    locales: readonly string[],
    fallback = '',
): string {
    for (const locale of locales) {
        const value = text?.[locale];

        if (typeof value === 'string' && value.trim() !== '') {
            return value;
        }
    }

    if (text) {
        for (const value of Object.values(text)) {
            if (typeof value === 'string' && value.trim() !== '') {
                return value;
            }
        }
    }

    return fallback;
}

/**
 * Parse custom validation rules from field settings.
 *
 * @param settings - Raw field settings
 * @returns Parsed validation rules, skipping invalid entries
 */
export function parseValidationRules(
    settings?: Record<string, unknown> | null,
): FieldValidationRule[] {
    const raw = settings?.validation_rules;

    if (!Array.isArray(raw)) {
        return [];
    }

    const allowed = new Set(
        FIELD_VALIDATION_OPERATORS.map((operator) => operator.value),
    );

    return raw
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
            const rule = entry as { operator?: unknown; value?: unknown };
            const operator = String(rule.operator ?? '') as FieldValidationOperator;

            if (!allowed.has(operator)) {
                return null;
            }

            const meta = FIELD_VALIDATION_OPERATORS.find(
                (option) => option.value === operator,
            );

            if (meta?.needsValue) {
                const value = rule.value;

                if (value === undefined || value === null || value === '') {
                    return null;
                }

                return {
                    operator,
                    value:
                        operator === 'min_length' ||
                        operator === 'max_length' ||
                        operator === 'min' ||
                        operator === 'max'
                            ? Number(value)
                            : String(value),
                };
            }

            return { operator };
        })
        .filter((rule): rule is FieldValidationRule => rule !== null);
}

/**
 * Parse shared advanced settings common to most field types.
 *
 * @param settings - Raw field settings
 * @returns Common settings normalized for UI state
 */
export function parseCommonFieldSettings(
    settings?: Record<string, unknown> | null,
): CommonFieldSettings {
    return {
        displayName: parseTranslatedText(settings?.display_name),
        note: parseTranslatedText(settings?.note),
        required: isFieldRequired(settings),
        readonly: isFieldReadonly(settings),
        hiddenInForm: isFieldHiddenInForm(settings),
        defaultValue: settings?.default_value ?? null,
        validationRules: parseValidationRules(settings),
        validationMessage: parseTranslatedText(settings?.validation_message),
    };
}

/**
 * Serialize common advanced field settings for persistence.
 *
 * @param common - Common settings from the field editor
 * @returns Settings object ready to persist on the field
 */
export function serializeCommonFieldSettings(
    common: CommonFieldSettings,
): Record<string, unknown> {
    const out: Record<string, unknown> = {
        required: common.required ? '1' : '0',
        readonly: common.readonly ? '1' : '0',
        hidden_in_form: common.hiddenInForm ? '1' : '0',
    };

    const displayName = serializeTranslatedText(common.displayName);

    if (displayName) {
        out.display_name = displayName;
    }

    const note = serializeTranslatedText(common.note);

    if (note) {
        out.note = note;
    }

    const validationMessage = serializeTranslatedText(common.validationMessage);

    if (validationMessage) {
        out.validation_message = validationMessage;
    }

    if (
        common.defaultValue !== null &&
        common.defaultValue !== undefined &&
        common.defaultValue !== ''
    ) {
        out.default_value = common.defaultValue;
    }

    if (common.validationRules.length > 0) {
        out.validation_rules = common.validationRules.map((rule) => ({
            operator: rule.operator,
            ...(rule.value !== undefined ? { value: rule.value } : {}),
        }));
    }

    return out;
}

/**
 * Whether the field is marked read-only in its settings.
 *
 * @param settings - Raw field settings
 * @returns Whether the field is read-only in forms
 */
export function isFieldReadonly(
    settings?: Record<string, unknown> | null,
): boolean {
    return settingsFlag(settings?.readonly);
}

/**
 * Resolve the display name for a field in the active locale.
 *
 * @param settings - Raw field settings
 * @param fieldKey - Fallback label when display name is unset
 * @param locales - Preferred locale order
 * @returns Resolved field label for forms
 */
export function getFieldDisplayName(
    settings: Record<string, unknown> | null | undefined,
    fieldKey: string,
    locales: readonly string[] = COLLECTION_FIELD_LOCALES,
): string {
    const common = parseCommonFieldSettings(settings);

    return resolveTranslatedText(common.displayName, locales, fieldKey);
}

/**
 * Resolve the helper note for a field in the active locale.
 *
 * @param settings - Raw field settings
 * @param locales - Preferred locale order
 * @returns Resolved helper note text, or empty string
 */
export function getFieldNote(
    settings: Record<string, unknown> | null | undefined,
    locales: readonly string[] = COLLECTION_FIELD_LOCALES,
): string {
    return resolveTranslatedText(parseCommonFieldSettings(settings).note, locales);
}

/**
 * Resolve the placeholder text for a field in the active locale.
 *
 * @param settings - Raw field settings
 * @param locales - Preferred locale order
 * @returns Resolved placeholder text, or empty string
 */
export function getFieldPlaceholder(
    settings: Record<string, unknown> | null | undefined,
    locales: readonly string[] = COLLECTION_FIELD_LOCALES,
): string {
    const placeholder = parseTranslatedText(
        (settings as { placeholder?: unknown } | null | undefined)?.placeholder,
    );

    return resolveTranslatedText(placeholder, locales);
}

/** Parsed settings for string/text input fields. */
export type StringFieldSettings = {
    inputType: string;
    placeholder: TranslatedText;
    iconLeft: string;
    iconRight: string;
    maxLength: number | null;
    trim: boolean;
    slugify: boolean;
    masked: boolean;
    defaultValue: string;
};

/**
 * @param settings - Raw field settings
 * @returns String field settings with sane defaults
 */
export function parseStringFieldSettings(
    settings?: Record<string, unknown> | null,
): StringFieldSettings {
    const inputType = String(settings?.input_type ?? 'string');
    const maxLengthRaw = settings?.max_length;

    return {
        inputType: STRING_INPUT_TYPES.some((option) => option.value === inputType)
            ? inputType
            : 'string',
        placeholder: parseTranslatedText(settings?.placeholder),
        iconLeft: String(settings?.icon_left ?? ''),
        iconRight: String(settings?.icon_right ?? ''),
        maxLength:
            maxLengthRaw !== undefined &&
            maxLengthRaw !== null &&
            maxLengthRaw !== '' &&
            Number.isFinite(Number(maxLengthRaw))
                ? Number(maxLengthRaw)
                : null,
        trim: settingsFlag(settings?.trim),
        slugify: settingsFlag(settings?.slugify),
        masked: settingsFlag(settings?.masked),
        defaultValue:
            settings?.default_value === null || settings?.default_value === undefined
                ? ''
                : String(settings.default_value),
    };
}

/**
 * Serialize string-like field settings for persistence.
 *
 * @param stringSettings - String field editor state
 * @returns Settings object ready to persist
 */
export function serializeStringFieldSettings(
    stringSettings: StringFieldSettings,
): Record<string, unknown> {
    const out: Record<string, unknown> = {
        input_type: stringSettings.inputType,
        trim: stringSettings.trim ? '1' : '0',
        slugify: stringSettings.slugify ? '1' : '0',
        masked: stringSettings.masked ? '1' : '0',
    };

    const placeholder = serializeTranslatedText(stringSettings.placeholder);

    if (placeholder) {
        out.placeholder = placeholder;
    }

    if (stringSettings.iconLeft.trim()) {
        out.icon_left = stringSettings.iconLeft.trim();
    }

    if (stringSettings.iconRight.trim()) {
        out.icon_right = stringSettings.iconRight.trim();
    }

    if (stringSettings.maxLength !== null) {
        out.max_length = stringSettings.maxLength;
    }

    if (stringSettings.defaultValue !== '') {
        out.default_value = stringSettings.defaultValue;
    }

    return out;
}

/** Parsed settings for textarea fields. */
export type TextareaFieldSettings = {
    placeholder: TranslatedText;
    rows: number;
    maxLength: number | null;
};

/**
 * @param settings - Raw field settings
 * @returns Textarea settings with row count and length limits
 */
export function parseTextareaFieldSettings(
    settings?: Record<string, unknown> | null,
): TextareaFieldSettings {
    const rows = Number(settings?.rows ?? 6);

    return {
        placeholder: parseTranslatedText(settings?.placeholder),
        rows: Number.isFinite(rows) && rows > 0 ? rows : 6,
        maxLength: parseOptionalNumber(settings?.max_length),
    };
}

/** Parsed settings for numeric fields. */
export type NumberFieldSettings = {
    min: number | null;
    max: number | null;
    step: number | null;
    placeholder: TranslatedText;
};

/**
 * @param settings - Raw field settings
 * @returns Number field bounds and placeholder
 */
export function parseNumberFieldSettings(
    settings?: Record<string, unknown> | null,
): NumberFieldSettings {
    return {
        min: parseOptionalNumber(settings?.min),
        max: parseOptionalNumber(settings?.max),
        step: parseOptionalNumber(settings?.step),
        placeholder: parseTranslatedText(settings?.placeholder),
    };
}

/** On/off labels for boolean toggle fields. */
export type BooleanFieldSettings = {
    labelOn: TranslatedText;
    labelOff: TranslatedText;
};

/**
 * @param settings - Raw field settings
 * @returns Boolean toggle label translations
 */
export function parseBooleanFieldSettings(
    settings?: Record<string, unknown> | null,
): BooleanFieldSettings {
    return {
        labelOn: parseTranslatedText(settings?.label_on),
        labelOff: parseTranslatedText(settings?.label_off),
    };
}

/** Date/time picker display options. */
export type DateFieldMode = 'date' | 'time' | 'datetime';

export type DateFieldSettings = {
    includeSeconds: boolean;
    mode: DateFieldMode;
};

/**
 * @param settings - Raw field settings
 * @returns Date picker mode and seconds flag
 */
export function parseDateFieldSettings(
    settings?: Record<string, unknown> | null,
): DateFieldSettings {
    const modeRaw = String(settings?.date_mode ?? 'datetime');
    const mode: DateFieldMode =
        modeRaw === 'date' || modeRaw === 'time' ? modeRaw : 'datetime';

    return {
        includeSeconds: settingsFlag(settings?.include_seconds),
        mode,
    };
}

/** Remote autocomplete endpoint and mapping settings. */
export type ApiAutocompleteFieldSettings = {
    url: string;
    resultsPath: string;
    textPath: string;
    valuePath: string;
    trigger: 'throttle' | 'debounce';
    rate: number;
    placeholder: TranslatedText;
    iconLeft: string;
    iconRight: string;
};

/**
 * @param settings - Raw field settings
 * @returns API autocomplete configuration
 */
export function parseApiAutocompleteFieldSettings(
    settings?: Record<string, unknown> | null,
): ApiAutocompleteFieldSettings {
    const trigger = String(settings?.trigger ?? 'debounce');

    return {
        url: String(settings?.url ?? ''),
        resultsPath: String(settings?.results_path ?? 'data'),
        textPath: String(settings?.text_path ?? 'label'),
        valuePath: String(settings?.value_path ?? 'value'),
        trigger: trigger === 'throttle' ? 'throttle' : 'debounce',
        rate: Number.isFinite(Number(settings?.rate))
            ? Math.max(0, Number(settings?.rate))
            : 300,
        placeholder: parseTranslatedText(settings?.placeholder),
        iconLeft: String(settings?.icon_left ?? ''),
        iconRight: String(settings?.icon_right ?? ''),
    };
}

/** Select field behavior flags. */
export type SelectFieldSettings = {
    allowNone: boolean;
    allowOther: boolean;
};

/**
 * @param settings - Raw field settings
 * @returns Select allow-none and allow-other flags
 */
export function parseSelectFieldSettings(
    settings?: Record<string, unknown> | null,
): SelectFieldSettings {
    return {
        allowNone: settingsFlag(settings?.allow_none),
        allowOther: settingsFlag(settings?.allow_other),
    };
}

/** Tag field presets and normalization options. */
export type TagFieldSettings = {
    presets: string[];
    allowOther: boolean;
    lowercase: boolean;
    alphabetize: boolean;
    separator: string;
};

/**
 * @param settings - Raw field settings
 * @returns Tag field presets and formatting options
 */
export function parseTagFieldSettings(
    settings?: Record<string, unknown> | null,
): TagFieldSettings {
    const presetsRaw = settings?.presets;

    return {
        presets: Array.isArray(presetsRaw)
            ? presetsRaw.map((entry) => String(entry)).filter(Boolean)
            : [],
        allowOther: settings?.allow_other !== false,
        lowercase: settingsFlag(settings?.lowercase),
        alphabetize: settingsFlag(settings?.alphabetize),
        separator: String(settings?.separator ?? ','),
    };
}

/** Code editor field display options. */
export type CodeFieldSettings = {
    language: string;
    lineNumbers: boolean;
    lineWrapping: boolean;
    template: string;
};

/**
 * @param settings - Raw field settings
 * @returns Code editor language and display flags
 */
export function parseCodeFieldSettings(
    settings?: Record<string, unknown> | null,
): CodeFieldSettings {
    return {
        language: String(settings?.language ?? 'javascript'),
        lineNumbers: settings?.line_numbers !== false,
        lineWrapping: settingsFlag(settings?.line_wrapping),
        template: String(settings?.template ?? ''),
    };
}

/** Map field default viewport center and zoom. */
export type MapFieldSettings = {
    defaultLat: number | null;
    defaultLng: number | null;
    defaultZoom: number;
};

/**
 * @param settings - Raw field settings
 * @returns Default map coordinates and zoom
 */
export function parseMapFieldSettings(
    settings?: Record<string, unknown> | null,
): MapFieldSettings {
    const zoom = Number(settings?.default_zoom ?? 12);

    return {
        defaultLat: parseOptionalNumber(settings?.default_lat),
        defaultLng: parseOptionalNumber(settings?.default_lng),
        defaultZoom: Number.isFinite(zoom) ? zoom : 12,
    };
}

/** Color picker opacity and preset swatches. */
export type ColorFieldSettings = {
    opacity: boolean;
    presetColors: string[];
};

/**
 * @param settings - Raw field settings
 * @returns Color picker options
 */
export function parseColorFieldSettings(
    settings?: Record<string, unknown> | null,
): ColorFieldSettings {
    const presetsRaw = settings?.preset_colors;

    return {
        opacity: settingsFlag(settings?.opacity),
        presetColors: Array.isArray(presetsRaw)
            ? presetsRaw.map((entry) => String(entry)).filter(Boolean)
            : [],
    };
}

/** Image picker constraints and display options. */
export type ImageFieldSettings = {
    allowMultiple: boolean;
    allowedMimeTypes: string[];
    cropToFit: boolean;
};

/**
 * @param settings - Raw field settings
 * @returns Image field mime and layout options
 */
export function parseImageFieldSettings(
    settings?: Record<string, unknown> | null,
): ImageFieldSettings {
    return {
        allowMultiple: isImageFieldMultiple(settings),
        allowedMimeTypes: parseStringArraySetting(settings?.allowed_mime_types),
        cropToFit: settingsFlag(settings?.crop_to_fit),
    };
}

/** Generic files field mime constraints. */
export type FilesFieldSettings = {
    allowedMimeTypes: string[];
};

/**
 * @param settings - Raw field settings
 * @returns Allowed mime types for files fields
 */
export function parseFilesFieldSettings(
    settings?: Record<string, unknown> | null,
): FilesFieldSettings {
    return {
        allowedMimeTypes: parseStringArraySetting(settings?.allowed_mime_types),
    };
}

/** Relation field target collection and display configuration. */
export type RelationFieldSettings = {
    relatedCollectionId: string;
    displayField: string;
    displayTemplate: string;
    filterJson: string;
    allowDuplicates: boolean;
    layout: 'list' | 'table';
};

/**
 * @param settings - Raw field settings
 * @returns Relation picker configuration
 */
export function parseRelationFieldSettings(
    settings?: Record<string, unknown> | null,
): RelationFieldSettings {
    const layout = String(settings?.layout ?? 'list');
    const filter = settings?.filter;

    return {
        relatedCollectionId: String(settings?.related_collection_id ?? ''),
        displayField: String(settings?.display_field ?? 'title'),
        displayTemplate: String(settings?.display_template ?? ''),
        filterJson:
            filter && typeof filter === 'object' && !Array.isArray(filter)
                ? JSON.stringify(filter, null, 2)
                : typeof filter === 'string'
                  ? filter
                  : '',
        allowDuplicates: settingsFlag(settings?.allow_duplicates),
        layout: layout === 'table' ? 'table' : 'list',
    };
}

/** Many-to-any builder allowed collections and duplication flag. */
export type M2aFieldSettings = {
    allowedCollectionIds: number[];
    allowDuplicates: boolean;
};

/**
 * @param settings - Raw field settings
 * @returns M2A builder settings
 */
export function parseM2aFieldSettings(
    settings?: Record<string, unknown> | null,
): M2aFieldSettings {
    return {
        allowedCollectionIds: parseAllowedCollectionIds(settings),
        allowDuplicates: settingsFlag(settings?.allow_duplicates),
    };
}

/** Hash field display options. */
export type HashFieldSettings = {
    masked: boolean;
};

/**
 * @param settings - Raw field settings
 * @returns Hash field display flags
 */
export function parseHashFieldSettings(
    settings?: Record<string, unknown> | null,
): HashFieldSettings {
    return { masked: settingsFlag(settings?.masked) };
}

/** Slider field settings including live value display. */
export type SliderFieldSettingsExtended = SliderFieldSettings & {
    showValue: boolean;
};

/**
 * @param settings - Raw field settings
 * @returns Slider bounds plus show-value flag
 */
export function parseSliderFieldSettings(
    settings?: Record<string, unknown> | null,
): SliderFieldSettingsExtended {
    const base = parseSliderSettings(settings);

    return {
        ...base,
        showValue: settings?.show_value !== false,
    };
}

function parseOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function parseStringArraySetting(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((entry) => String(entry)).filter(Boolean);
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
        'm2a',
        'many_to_many',
        'one_to_many',
        'relation_tree',
        'many_to_one',
        'relation',
        'relation_many',
    ].includes(fieldType);
}

/**
 * Flattens nested settings into Inertia form `{ name, value }` pairs.
 *
 * @param settings - Nested settings object
 * @param prefix - Root form key prefix (default `settings`)
 * @returns Flat form field entries
 */
export function flattenSettingsForForm(
    settings: Record<string, unknown>,
    prefix = 'settings',
): Array<{ name: string; value: string }> {
    const entries: Array<{ name: string; value: string }> = [];

    const walk = (value: unknown, base: string): void => {
        if (value === null || value === undefined) {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (typeof item === 'object' && item !== null) {
                    walk(item, `${base}[${index}]`);
                } else {
                    entries.push({
                        name: `${base}[${index}]`,
                        value: String(item ?? ''),
                    });
                }
            });

            return;
        }

        if (typeof value === 'object') {
            for (const [key, nested] of Object.entries(value)) {
                walk(nested, `${base}[${key}]`);
            }

            return;
        }

        entries.push({ name: base, value: String(value) });
    };

    for (const [key, value] of Object.entries(settings)) {
        walk(value, `${prefix}[${key}]`);
    }

    return entries;
}

/**
 * Builds the persisted settings payload for a field, merging common, type-specific, and option data.
 *
 * @param fieldType - Field type key
 * @param common - Common settings from the editor
 * @param typeSettings - Type-specific settings object
 * @param options - Flat options when the type needs them
 * @param treeOptions - Tree options when the type needs them
 * @returns Combined settings object for save requests
 */
export function buildFieldSettingsPayload(
    fieldType: string,
    common: CommonFieldSettings,
    typeSettings: Record<string, unknown>,
    options?: FieldOptionRow[],
    treeOptions?: FieldTreeOptionRow[],
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        ...serializeCommonFieldSettings(common),
        ...typeSettings,
    };

    if (options && fieldTypeNeedsOptions(fieldType) && !fieldTypeNeedsTreeOptions(fieldType)) {
        payload.options = options
            .filter(
                (option) =>
                    option.value.trim() !== '' || option.label.trim() !== '',
            )
            .map((option) => ({
                value: option.value,
                label: option.label || option.value,
            }));
    }

    if (treeOptions && fieldTypeNeedsTreeOptions(fieldType)) {
        payload.options = filterTreeOptionsForPayload(treeOptions);
    }

    return payload;
}

function filterTreeOptionsForPayload(
    options: FieldTreeOptionRow[],
): FieldTreeOptionRow[] {
    return options
        .filter(
            (option) =>
                option.value.trim() !== '' || option.label.trim() !== '',
        )
        .map((option) => ({
            ...option,
            children: filterTreeOptionsForPayload(option.children ?? []),
        }));
}
