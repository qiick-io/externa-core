import {
    DEFAULT_BLOCKS_DEPTH,
    MAX_BLOCKS_DEPTH,
    STRING_INPUT_TYPES,
    blocksAllowedFieldTypesForDepth,
    effectiveMaxBlocksDepth,
} from './catalog';
import type {
    BlocksTypeDefinition,
    FieldOptionRow,
    FieldTreeOptionRow,
    SliderFieldSettings,
} from './catalog';
import {
    isFieldRequired,
    parseTranslatedText,
    serializeTranslatedText,
} from './display';
import type { TranslatedText } from './display';

function settingsFlag(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}

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

/**
 * Parse string-input settings from a field settings blob.
 *
 * @param settings - Raw string field settings
 * @returns Input subtype, default value, and required flag for forms
 */
export function parseStringInputSettings(
    settings?: Record<string, unknown> | null,
): {
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
        inputType: STRING_INPUT_TYPES.some(
            (option) => option.value === inputType,
        )
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
            settings?.default_value === null ||
            settings?.default_value === undefined
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

/** Map field default viewport center, zoom, and geometry mode. */
export type MapFieldSettings = {
    defaultLat: number | null;
    defaultLng: number | null;
    defaultZoom: number;
    geometryMode: 'point' | 'multipoint';
};

/**
 * @param settings - Raw field settings
 * @returns Default map coordinates, zoom, and geometry mode
 */
export function parseMapFieldSettings(
    settings?: Record<string, unknown> | null,
): MapFieldSettings {
    const zoom = Number(settings?.default_zoom ?? 12);
    const mode =
        settings?.geometry_mode === 'multipoint' ? 'multipoint' : 'point';

    return {
        defaultLat: parseOptionalNumber(settings?.default_lat),
        defaultLng: parseOptionalNumber(settings?.default_lng),
        defaultZoom: Number.isFinite(zoom) ? zoom : 12,
        geometryMode: mode,
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
    /** M2M junction meta mini-schema (`settings.junction_fields`). */
    junctionFields: JunctionFieldDefinition[];
    junctionFieldsJson: string;
};

/** Leaf schema for M2M junction metadata fields. */
export type JunctionFieldDefinition = {
    name: string;
    type: string;
};

/**
 * Parse `settings.junction_fields` for many-to-many meta inputs.
 */
export function parseJunctionFields(
    settings?: Record<string, unknown> | null,
): JunctionFieldDefinition[] {
    const raw = settings?.junction_fields;

    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }

            const row = entry as Record<string, unknown>;
            const name = String(row.name ?? '').trim();

            if (name === '') {
                return null;
            }

            return {
                name,
                type: String(row.type ?? 'string').trim() || 'string',
            };
        })
        .filter((entry): entry is JunctionFieldDefinition => entry !== null);
}

/**
 * @param settings - Raw field settings
 * @returns Relation picker configuration
 */
export function parseRelationFieldSettings(
    settings?: Record<string, unknown> | null,
): RelationFieldSettings {
    const layout = String(settings?.layout ?? 'list');
    const filter = settings?.filter;
    const junctionFields = parseJunctionFields(settings);

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
        junctionFields,
        junctionFieldsJson:
            junctionFields.length > 0
                ? JSON.stringify(junctionFields, null, 2)
                : Array.isArray(settings?.junction_fields)
                  ? JSON.stringify(settings?.junction_fields, null, 2)
                  : '',
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

export function parseBlocksFieldSettings(
    settings?: Record<string, unknown> | null,
): { blockTypes: BlocksTypeDefinition[]; maxBlocksDepth: number } {
    const raw = settings?.block_types;
    const maxBlocksDepth = effectiveMaxBlocksDepth(settings);

    if (!Array.isArray(raw)) {
        return { blockTypes: [], maxBlocksDepth };
    }

    return {
        maxBlocksDepth,
        blockTypes: raw
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => {
                const block = entry as {
                    key?: unknown;
                    label?: unknown;
                    fields?: unknown;
                };

                return {
                    key: String(block.key ?? ''),
                    label: String(block.label ?? ''),
                    fields: Array.isArray(block.fields)
                        ? block.fields
                              .filter(
                                  (field) => field && typeof field === 'object',
                              )
                              .map((field) => {
                                  const nested = field as {
                                      name?: unknown;
                                      type?: unknown;
                                      translatable?: unknown;
                                      settings?: unknown;
                                  };

                                  return {
                                      name: String(nested.name ?? ''),
                                      type: String(nested.type ?? ''),
                                      translatable:
                                          nested.translatable === true ||
                                          nested.translatable === 1 ||
                                          nested.translatable === '1',
                                      settings:
                                          nested.settings &&
                                          typeof nested.settings === 'object' &&
                                          !Array.isArray(nested.settings)
                                              ? (nested.settings as Record<
                                                    string,
                                                    unknown
                                                >)
                                              : {},
                                  };
                              })
                        : [],
                };
            }),
    };
}

const BLOCK_KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Drop incomplete block types / nested fields before the form posts.
 * Incomplete draft rows stay in the editor UI but must not fail validation.
 * Recurses into nested `blocks` field settings up to maxDepth (default 3, ceiling 5).
 */
export function serializeBlocksFieldSettings(
    blockTypes: BlocksTypeDefinition[],
    depth = 1,
    maxDepth: number = DEFAULT_BLOCKS_DEPTH,
): Array<{
    key: string;
    label: string;
    fields: Array<{
        name: string;
        type: string;
        translatable: '1' | '0';
        settings: Record<string, unknown>;
    }>;
}> {
    const cappedMax = Math.max(
        1,
        Math.min(MAX_BLOCKS_DEPTH, Math.trunc(maxDepth)),
    );
    const allowed = new Set<string>(
        blocksAllowedFieldTypesForDepth(depth, cappedMax),
    );

    return blockTypes
        .map((blockType) => {
            const key = blockType.key.trim();
            const label = blockType.label.trim();

            return {
                key,
                label,
                fields: blockType.fields
                    .map((field) => {
                        const name = field.name.trim();
                        const type = field.type.trim();
                        let settings = field.settings ?? {};

                        if (type === 'blocks' && depth < cappedMax) {
                            const nested =
                                parseBlocksFieldSettings(settings).blockTypes;
                            settings = {
                                block_types: serializeBlocksFieldSettings(
                                    nested,
                                    depth + 1,
                                    cappedMax,
                                ),
                            };
                        }

                        return {
                            name,
                            type,
                            // Nested blocks fields are never themselves translatable.
                            translatable: (type === 'blocks'
                                ? '0'
                                : field.translatable
                                  ? '1'
                                  : '0') as '1' | '0',
                            settings,
                        };
                    })
                    .filter(
                        (field) =>
                            BLOCK_KEY_RE.test(field.name) &&
                            allowed.has(field.type),
                    ),
            };
        })
        .filter(
            (blockType) =>
                BLOCK_KEY_RE.test(blockType.key) && blockType.label !== '',
        );
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
