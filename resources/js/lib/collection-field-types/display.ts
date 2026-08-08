import { fieldTypeNeedsOptions, fieldTypeNeedsTreeOptions } from './catalog';
import type { FieldOptionRow, FieldTreeOptionRow } from './catalog';

function settingsFlag(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}

/**
 * Whether the field is marked required in its settings.
 *
 * @param settings - Raw field settings
 * @returns Whether the field is required in forms
 */
export function isFieldRequired(
    settings?: Record<string, unknown> | null,
): boolean {
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
export function fieldsVisibleInForm<
    T extends { settings?: Record<string, unknown> | null },
>(fields: T[]): T[] {
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
export function getFieldGridColSpans<
    T extends { settings?: Record<string, unknown> | null },
>(fields: T[]): (1 | 2)[] {
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
export function groupFieldsIntoLayoutRows<
    T extends { settings?: Record<string, unknown> | null },
>(fields: T[]): FieldLayoutRowItem<T>[][] {
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

        // Full-width fields always start their own row (don't share a grid with an unpaired half).
        if (colSpan === 2 && currentRow.length > 0) {
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
    layoutWidth: FieldLayoutWidth;
    layoutStartsNewRow: boolean;
};

/**
 * @param raw - Stored translated text object
 * @returns Normalized locale map with non-empty strings only
 */
export function parseTranslatedText(raw: unknown): TranslatedText {
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
            const operator = String(
                rule.operator ?? '',
            ) as FieldValidationOperator;

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
        layoutWidth: getFieldLayoutWidth(settings),
        layoutStartsNewRow: fieldStartsNewLayoutRow(settings),
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
        layout_width: common.layoutWidth,
        layout_starts_new_row: common.layoutStartsNewRow ? '1' : '0',
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
    return resolveTranslatedText(
        parseCommonFieldSettings(settings).note,
        locales,
    );
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

        // ponytail: PHP (bool)"false" is true — always send 1/0 for booleans
        if (typeof value === 'boolean') {
            entries.push({ name: base, value: value ? '1' : '0' });

            return;
        }

        entries.push({ name: base, value: String(value) });
    };

    for (const [key, value] of Object.entries(settings)) {
        walk(value, `${prefix}[${key}]`);
    }

    return entries;
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

    if (
        fieldType === 'group_accordion' ||
        fieldType === 'group_detail' ||
        fieldType === 'group_raw' ||
        fieldType === 'group_tabs'
    ) {
        payload.layout_width = 'full';
        delete payload.layout_starts_new_row;
    }

    if (
        options &&
        fieldTypeNeedsOptions(fieldType) &&
        !fieldTypeNeedsTreeOptions(fieldType)
    ) {
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
