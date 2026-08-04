import { ChevronDown } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ContentLocaleProvider } from '@/components/collections/content-locale-provider';
import { BlocksFieldInput } from '@/components/collections/item-field-blocks-input';
import {
    ApiAutocompleteInput,
    BooleanToggleInput,
    CheckboxGroupInput,
    CheckboxGroupTreeInput,
    FieldNote,
    HashFieldInput,
    InputWithIcons,
    MultiselectWithOtherInput,
    RadioWithOtherInput,
    SelectWithOtherInput,
    SliderFieldInput,
    StaticAutocompleteInput,
    defaultBooleanChecked,
    toDateInputValue,
    toDatetimeLocalValue,
    toTimeInputValue,
} from '@/components/collections/item-field-choice-inputs';
import {
    FileFieldInput,
    MultipleFilesFieldInput,
} from '@/components/collections/item-field-files-input';
import { M2aFieldInput } from '@/components/collections/item-field-m2a-input';
import {
    ManyToManyFieldInput,
    RelationFieldInput,
} from '@/components/collections/item-field-relation-inputs';
import {
    CodeFieldInput,
    ColorFieldInput,
    MarkdownFieldInput,
    TagChipInput,
    WysiwygFieldInput,
} from '@/components/collections/item-field-rich-inputs';
import { LocalizedField } from '@/components/collections/localized-field';
import { MapCoordinateInput } from '@/components/collections/map-coordinate-input';
import { Badge } from '@/components/ui/badge';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getFieldError } from '@/lib/collection-data-errors';
import {
    getFieldDisplayName,
    getFieldPlaceholder,
    groupFieldsIntoLayoutRows,
    isImageFieldMultiple,
    parseDateFieldSettings,
    parseFieldOptions,
    parseNumberFieldSettings,
    parseSelectFieldSettings,
    parseStringFieldSettings,
    parseTextareaFieldSettings,
    resolveTranslatedText,
} from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import {
    parseCollectionFormLayout,
    resolveFormLayoutGroups,
    resolveFormLayoutLabel,
} from '@/lib/collection-form-layout';
import { evaluateFieldFlags } from '@/lib/field-conditions';
import { cn } from '@/lib/utils';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

type FieldDef = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
    settings?: Record<string, unknown> | null;
};

type DefaultValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;

type FieldRenderContext = {
    field: FieldDef;
    name: string;
    id: string;
    collectionId: number;
    locales: string[];
    readonly: boolean;
    defaultValue: DefaultValue;
    relatedCollections: RelatedCollectionOption[];
    /** When rendering a nested blocks field, parent depth + 1 (see BlocksFieldInput). */
    nestingDepth?: number;
    /** Root blocks max nesting, threaded through nested blocks. */
    maxBlocksDepth?: number;
    /** Whether this field has a validation error */
    hasError?: boolean;
};

function getDefaultScalar(
    defaults: Record<string, unknown> | undefined,
    name: string,
): DefaultValue {
    const defaultEntry = defaults?.[name];

    if (
        typeof defaultEntry === 'string' ||
        typeof defaultEntry === 'number' ||
        typeof defaultEntry === 'boolean'
    ) {
        return defaultEntry;
    }

    if (Array.isArray(defaultEntry)) {
        return defaultEntry as string[] | number[];
    }

    if (
        defaultEntry &&
        typeof defaultEntry === 'object' &&
        !Array.isArray(defaultEntry)
    ) {
        return defaultEntry as Record<string, unknown>;
    }

    return '';
}

function getDefaultLocale(
    defaults: Record<string, unknown> | undefined,
    name: string,
    locale: string,
): DefaultValue {
    const defaultEntry = defaults?.[name];

    if (
        defaultEntry &&
        typeof defaultEntry === 'object' &&
        !Array.isArray(defaultEntry)
    ) {
        const localeValue = (defaultEntry as Record<string, unknown>)[locale];

        if (Array.isArray(localeValue)) {
            return localeValue as string[] | number[];
        }

        if (
            typeof localeValue === 'string' ||
            typeof localeValue === 'number' ||
            typeof localeValue === 'boolean'
        ) {
            return localeValue;
        }

        if (
            localeValue &&
            typeof localeValue === 'object' &&
            !Array.isArray(localeValue)
        ) {
            return localeValue as Record<string, unknown>;
        }
    }

    return '';
}

function toNumberOrNull(value: DefaultValue): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function toNumberArray(value: DefaultValue): number[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => {
            if (typeof entry === 'number' || typeof entry === 'string') {
                return Number(entry);
            }

            // M2M / relation payloads may arrive as junction objects
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                return Number(
                    (entry as { related_item_id?: unknown; id?: unknown })
                        .related_item_id ?? (entry as { id?: unknown }).id,
                );
            }

            return Number.NaN;
        })
        .filter((entry) => Number.isFinite(entry));
}

function toStringArray(value: DefaultValue): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map(String);
}

function renderFieldControl(context: FieldRenderContext) {
    const {
        field,
        name,
        id,
        collectionId,
        locales,
        readonly,
        defaultValue,
        relatedCollections,
        nestingDepth,
        maxBlocksDepth,
        hasError,
    } = context;
    const options = parseFieldOptions(field.settings).filter(
        (option) => option.value.trim() !== '',
    );
    const stringSettings = parseStringFieldSettings(field.settings);
    const numberSettings = parseNumberFieldSettings(field.settings);
    const textareaSettings = parseTextareaFieldSettings(field.settings);
    const placeholder = getFieldPlaceholder(field.settings, locales);

    switch (field.type) {
        case 'boolean':
            return (
                <BooleanToggleInput
                    id={id}
                    name={name}
                    defaultChecked={defaultBooleanChecked(defaultValue)}
                    settings={field.settings}
                    locales={locales}
                    readonly={readonly}
                />
            );
        case 'number':
            return (
                <Input
                    id={id}
                    type="number"
                    step={numberSettings.step ?? 'any'}
                    min={numberSettings.min ?? undefined}
                    max={numberSettings.max ?? undefined}
                    name={name}
                    defaultValue={String(defaultValue ?? '')}
                    placeholder={placeholder}
                    readOnly={readonly}
                    aria-invalid={hasError}
                />
            );
        case 'slider':
            return (
                <SliderFieldInput
                    name={name}
                    settings={field.settings}
                    defaultValue={Number(defaultValue ?? 0)}
                    readonly={readonly}
                />
            );
        case 'textarea':
            return (
                <textarea
                    id={id}
                    name={name}
                    className={cn(inputLike, 'min-h-[120px] py-2', hasError && 'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive')}
                    defaultValue={String(defaultValue ?? '')}
                    rows={textareaSettings.rows}
                    placeholder={resolveTranslatedText(
                        textareaSettings.placeholder,
                        locales,
                        placeholder,
                    )}
                    readOnly={readonly}
                    aria-invalid={hasError}
                />
            );
        case 'wysiwyg':
            return (
                <WysiwygFieldInput
                    id={id}
                    name={name}
                    settings={field.settings}
                    locales={locales}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                    placeholder={placeholder}
                />
            );
        case 'markdown':
            return (
                <MarkdownFieldInput
                    id={id}
                    name={name}
                    settings={field.settings}
                    locales={locales}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                    placeholder={placeholder}
                />
            );
        case 'code':
            return (
                <CodeFieldInput
                    id={id}
                    name={name}
                    settings={field.settings}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                />
            );
        case 'select': {
            const selectSettings = parseSelectFieldSettings(field.settings);

            return (
                <SelectWithOtherInput
                    id={id}
                    name={name}
                    options={options}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                    allowNone={selectSettings.allowNone}
                    allowOther={selectSettings.allowOther}
                />
            );
        }
        case 'multiselect': {
            const selectSettings = parseSelectFieldSettings(field.settings);

            return (
                <MultiselectWithOtherInput
                    name={name}
                    options={options}
                    defaultValues={toStringArray(defaultValue)}
                    readonly={readonly}
                    allowOther={selectSettings.allowOther}
                />
            );
        }
        case 'checkbox_group': {
            const selectSettings = parseSelectFieldSettings(field.settings);

            return (
                <CheckboxGroupInput
                    name={name}
                    options={options}
                    defaultValues={toStringArray(defaultValue)}
                    readonly={readonly}
                    allowOther={selectSettings.allowOther}
                />
            );
        }
        case 'checkbox_group_tree':
            return (
                <CheckboxGroupTreeInput
                    name={name}
                    settings={field.settings}
                    defaultValues={toStringArray(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'radio_group': {
            const selectSettings = parseSelectFieldSettings(field.settings);

            return (
                <RadioWithOtherInput
                    name={name}
                    options={options}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                    allowOther={selectSettings.allowOther}
                />
            );
        }
        case 'date': {
            const dateSettings = parseDateFieldSettings(field.settings);
            const inputType =
                dateSettings.mode === 'date'
                    ? 'date'
                    : dateSettings.mode === 'time'
                      ? 'time'
                      : 'datetime-local';
            const value =
                dateSettings.mode === 'date'
                    ? toDateInputValue(defaultValue)
                    : dateSettings.mode === 'time'
                      ? toTimeInputValue(
                            defaultValue,
                            dateSettings.includeSeconds,
                        )
                      : toDatetimeLocalValue(
                            defaultValue,
                            dateSettings.includeSeconds,
                        );

            return (
                <Input
                    id={id}
                    type={inputType}
                    name={name}
                    step={
                        dateSettings.mode === 'date'
                            ? undefined
                            : dateSettings.includeSeconds
                              ? 1
                              : 60
                    }
                    defaultValue={value}
                    readOnly={readonly}
                    aria-invalid={hasError}
                />
            );
        }
        case 'map':
            return (
                <MapCoordinateInput
                    idPrefix={id}
                    nameBase={name}
                    defaultValue={defaultValue}
                    readonly={readonly}
                    settings={field.settings}
                />
            );
        case 'color':
            return (
                <ColorFieldInput
                    id={id}
                    name={name}
                    settings={field.settings}
                    defaultValue={String(defaultValue ?? '#000000')}
                    readonly={readonly}
                />
            );
        case 'tag':
            return (
                <TagChipInput
                    nameBase={name}
                    settings={field.settings}
                    defaultParts={toStringArray(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'hash':
            return (
                <HashFieldInput
                    id={id}
                    name={name}
                    defaultValue={String(defaultValue ?? '')}
                    settings={field.settings}
                    readonly={readonly}
                />
            );
        case 'autocomplete':
            return (
                <StaticAutocompleteInput
                    id={id}
                    name={name}
                    settings={field.settings}
                    locales={locales}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                />
            );
        case 'api_autocomplete':
            return (
                <ApiAutocompleteInput
                    id={id}
                    name={name}
                    settings={field.settings}
                    locales={locales}
                    defaultValue={String(defaultValue ?? '')}
                    readonly={readonly}
                />
            );
        case 'string':
            return (
                <InputWithIcons
                    iconLeft={stringSettings.iconLeft}
                    iconRight={stringSettings.iconRight}
                >
                    <Input
                        id={id}
                        type={
                            stringSettings.masked
                                ? 'password'
                                : stringSettings.inputType === 'integer' ||
                                    stringSettings.inputType === 'float' ||
                                    stringSettings.inputType === 'decimal'
                                  ? 'number'
                                  : 'text'
                        }
                        name={name}
                        defaultValue={String(defaultValue ?? '')}
                        placeholder={placeholder}
                        maxLength={stringSettings.maxLength ?? undefined}
                        readOnly={readonly}
                        aria-invalid={hasError}
                    />
                </InputWithIcons>
            );
        case 'image':
            if (isImageFieldMultiple(field.settings)) {
                return (
                    <MultipleFilesFieldInput
                        name={name}
                        defaultFileIds={toNumberArray(defaultValue)}
                        acceptImagesOnly
                        readonly={readonly}
                    />
                );
            }

            return (
                <FileFieldInput
                    name={name}
                    defaultFileId={toNumberOrNull(defaultValue)}
                    acceptImagesOnly
                    readonly={readonly}
                />
            );
        case 'files':
            return (
                <MultipleFilesFieldInput
                    name={name}
                    defaultFileIds={toNumberArray(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'file':
            return (
                <FileFieldInput
                    name={name}
                    defaultFileId={toNumberOrNull(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'relation':
        case 'many_to_one':
        case 'relation_tree':
            return (
                <RelationFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={toNumberOrNull(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'many_to_many':
            return (
                <ManyToManyFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={defaultValue}
                    readonly={readonly}
                />
            );
        case 'relation_many':
        case 'one_to_many':
            return (
                <RelationFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={toNumberArray(defaultValue)}
                    multiple
                    readonly={readonly}
                />
            );
        case 'm2a':
            return (
                <M2aFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={defaultValue}
                    readonly={readonly}
                    relatedCollections={relatedCollections}
                />
            );
        case 'blocks':
            return (
                <BlocksFieldInput
                    collectionId={collectionId}
                    field={field}
                    name={name}
                    defaultValue={defaultValue}
                    readonly={readonly}
                    relatedCollections={relatedCollections}
                    locales={locales}
                    depth={nestingDepth ?? 1}
                    maxBlocksDepth={maxBlocksDepth}
                    renderNestedField={renderFieldControl}
                />
            );
        default:
            return (
                <Input
                    id={id}
                    type="text"
                    name={name}
                    defaultValue={String(defaultValue ?? '')}
                    placeholder={placeholder}
                    readOnly={readonly}
                    aria-invalid={hasError}
                />
            );
    }
}

/**
 * Translatable item field with shared locale switcher (one control visible).
 */
function TranslatableItemField({
    field,
    locales,
    displayName,
    showFieldNameHeading,
    readonly,
    collectionId,
    relatedCollections,
    defaults,
    required,
    errorMessage,
}: {
    field: FieldDef;
    locales: string[];
    displayName: string;
    showFieldNameHeading: boolean;
    readonly: boolean;
    collectionId: number;
    relatedCollections: RelatedCollectionOption[];
    defaults?: Record<string, unknown>;
    required: boolean;
    errorMessage?: string;
}) {
    const labelText = showFieldNameHeading
        ? `${displayName}${required ? ' *' : ''}`
        : undefined;

    return (
        <LocalizedField
            locales={locales}
            label={labelText}
            showCopyActions={false}
            errorMessage={errorMessage}
        >
            {({ locale }) => (
                <div className="space-y-2">
                    <FieldNote settings={field.settings} locales={locales} />
                    {locales.map((code) => {
                        const inputId = `data_${field.name}_${code}`;
                        const isActive = code === locale;

                        return (
                            <div
                                key={code}
                                className={isActive ? 'grid gap-2' : 'hidden'}
                                aria-hidden={!isActive}
                            >
                                {renderFieldControl({
                                    field,
                                    name: `data[${field.name}][${code}]`,
                                    id: inputId,
                                    collectionId,
                                    locales,
                                    readonly,
                                    relatedCollections,
                                    defaultValue: getDefaultLocale(
                                        defaults,
                                        field.name,
                                        code,
                                    ),
                                    hasError: !!errorMessage,
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </LocalizedField>
    );
}

/**
 * Renders all dynamic fields for a collection item form.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function DynamicItemFields({
    fields,
    locales,
    defaults,
    collectionId,
    relatedCollections = [],
    variant = 'plain',
    fieldActions,
    formLayout,
    fieldGrants = null,
    isNew = false,
    fieldSearch = '',
    errors = {},
}: {
    fields: FieldDef[];
    locales: string[];
    defaults?: Record<string, unknown>;
    collectionId: number;
    relatedCollections?: RelatedCollectionOption[];
    variant?: 'plain' | 'cards';
    fieldActions?: (field: FieldDef) => ReactNode;
    formLayout?: Record<string, unknown> | null;
    /** null = unrestricted; otherwise enforce read/create/update per field */
    fieldGrants?: Record<
        string,
        { read: boolean; create: boolean; update: boolean }
    > | null;
    isNew?: boolean;
    fieldSearch?: string;
    errors?: Record<string, unknown>;
}) {
    const showFieldNameHeading = variant === 'plain';
    const gapClass = variant === 'cards' ? 'space-y-4' : 'space-y-6';
    const [formValues, setFormValues] = useState<Record<string, unknown>>(
        () => ({ ...(defaults ?? {}) }),
    );

    const layout = useMemo(
        () => parseCollectionFormLayout(formLayout ?? null),
        [formLayout],
    );

    const visibleFields = useMemo(
        () =>
            fields.filter((field) => {
                const schemaHidden =
                    field.settings?.hidden_in_form === true ||
                    field.settings?.hidden_in_form === 1 ||
                    field.settings?.hidden_in_form === '1';

                if (schemaHidden) {
                    return false;
                }

                if (fieldGrants !== null && fieldGrants[field.name]?.read !== true) {
                    return false;
                }

                if (fieldSearch.trim() !== '') {
                    const searchLower = fieldSearch.toLowerCase();
                    const displayName = getFieldDisplayName(
                        field.settings,
                        field.name,
                        locales,
                    ).toLowerCase();
                    const fieldName = field.name.toLowerCase();
                    
                    return (
                        displayName.includes(searchLower) ||
                        fieldName.includes(searchLower)
                    );
                }

                return true;
            }),
        [fields, fieldGrants, fieldSearch, locales],
    );

    const groups = useMemo(
        () => resolveFormLayoutGroups(layout, visibleFields),
        [layout, visibleFields],
    );

    const tabs = layout?.tabs ?? [];
    const [activeTabId, setActiveTabId] = useState<string | null>(
        () => tabs[0]?.id ?? null,
    );

    const updateFormValue = (fieldName: string, value: unknown): void => {
        setFormValues((current) => ({ ...current, [fieldName]: value }));
    };

    const renderOneField = (field: FieldDef): ReactNode => {
        const flags = evaluateFieldFlags(field.settings, formValues);

        if (flags.hidden) {
            return null;
        }

        const displayName = getFieldDisplayName(
            field.settings,
            field.name,
            locales,
        );
        const grant = fieldGrants?.[field.name];
        const aclReadonly =
            fieldGrants !== null &&
            !(isNew ? grant?.create === true : grant?.update === true);
        const readonly = flags.readonly || aclReadonly;
        const errorMessage = getFieldError(errors, field.name);

        const inner = field.translatable ? (
            <TranslatableItemField
                field={field}
                locales={locales}
                displayName={displayName}
                showFieldNameHeading={showFieldNameHeading}
                readonly={readonly}
                collectionId={collectionId}
                relatedCollections={relatedCollections}
                defaults={defaults}
                required={flags.required}
                errorMessage={errorMessage}
            />
        ) : (
            <div
                className="grid gap-2"
                onChange={(event) => {
                    const target = event.target as
                        | HTMLInputElement
                        | HTMLSelectElement
                        | HTMLTextAreaElement;

                    if (!target.name) {
                        return;
                    }

                    if (target.type === 'checkbox') {
                        return;
                    }

                    updateFormValue(field.name, target.value);
                }}
            >
                {showFieldNameHeading && (
                    <Label htmlFor={`data_${field.name}`}>
                        {displayName}
                        {flags.required ? ' *' : ''}
                    </Label>
                )}
                <FieldNote settings={field.settings} locales={locales} />
                {renderFieldControl({
                    field,
                    name: `data[${field.name}]`,
                    id: `data_${field.name}`,
                    collectionId,
                    locales,
                    readonly,
                    relatedCollections,
                    defaultValue: getDefaultScalar(defaults, field.name),
                    hasError: !!errorMessage,
                })}
                {errorMessage && (
                    <p className="text-sm text-destructive">{errorMessage}</p>
                )}
            </div>
        );

        if (variant === 'cards') {
            return (
                <div
                    key={field.id}
                    className="rounded-xl border border-sidebar-border/70 bg-card p-4 dark:border-sidebar-border"
                >
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-sidebar-border/70 pb-3 dark:border-sidebar-border">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                                {displayName}{flags.required ? ' *' : ''}
                            </span>
                            {field.translatable && (
                                <Badge variant="secondary">Translatable</Badge>
                            )}
                            {readonly && (
                                <Badge variant="secondary">
                                    {aclReadonly && !flags.readonly
                                        ? 'No write access'
                                        : 'Readonly'}
                                </Badge>
                            )}
                        </div>
                        {fieldActions?.(field)}
                    </div>
                    {inner}
                </div>
            );
        }

        return <Fragment key={field.id}>{inner}</Fragment>;
    };

    const renderFieldGrid = (sectionFields: FieldDef[]): ReactNode => {
        const rows = groupFieldsIntoLayoutRows(sectionFields);

        return (
            <div className={gapClass}>
                {rows.map((row) => (
                    <div
                        key={row.map((item) => item.field.id).join('-')}
                        className="grid grid-cols-1 gap-4 md:grid-cols-2"
                    >
                        {row.map(({ field, colSpan }) => (
                            <div
                                key={field.id}
                                className={colSpan === 2 ? 'md:col-span-2' : ''}
                            >
                                {renderOneField(field)}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    };

    const visibleGroups =
        tabs.length === 0
            ? groups
            : groups.filter((group) => {
                  const tabId = group.section?.tab_id ?? null;

                  if (activeTabId === null) {
                      return true;
                  }

                  return tabId === activeTabId || tabId === null;
              });

    return (
        <ContentLocaleProvider locales={locales}>
            <div className="space-y-6">
                {tabs.length > 0 ? (
                    <div className="flex flex-wrap gap-2 border-b pb-2">
                        {tabs.map((tab) => {
                            const label = resolveFormLayoutLabel(
                                tab.label,
                                locales,
                                tab.id,
                            );
                            const isActive = activeTabId === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={cn(
                                        'rounded-md px-3 py-1.5 text-sm',
                                        isActive
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                    onClick={() => setActiveTabId(tab.id)}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                {visibleGroups.map((group, index) => {
                    const section = group.section;

                    if (!section || (section.id === 'unsectioned' && !layout)) {
                        return (
                            <Fragment key={`flat-${index}`}>
                                {renderFieldGrid(group.fields)}
                            </Fragment>
                        );
                    }

                    const title = resolveFormLayoutLabel(
                        section.label,
                        locales,
                        'Section',
                    );

                    if (!section.collapsible) {
                        return (
                            <section key={section.id} className="space-y-3">
                                <h3 className="text-sm font-medium">{title}</h3>
                                {renderFieldGrid(group.fields)}
                            </section>
                        );
                    }

                    return (
                        <Collapsible
                            key={section.id}
                            defaultOpen={!section.collapsed}
                            className="space-y-3 rounded-xl border border-sidebar-border/70 p-4"
                        >
                            <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-sm font-medium">
                                {title}
                                <ChevronDown className="size-4" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                {renderFieldGrid(group.fields)}
                            </CollapsibleContent>
                        </Collapsible>
                    );
                })}
            </div>
        </ContentLocaleProvider>
    );
}
