import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState
    
} from 'react';
import type {ReactNode} from 'react';

import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { PaginatedMultiSelect } from '@/components/admin/paginated-multi-select';
import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import {
    CodeFieldInput,
    ColorFieldInput,
    MarkdownFieldInput,
    TagChipInput,
    WysiwygFieldInput,
} from '@/components/collections/item-field-rich-inputs';
import { MapCoordinateInput } from '@/components/collections/map-coordinate-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    getFieldDisplayName,
    getFieldNote,
    getFieldPlaceholder,
    isFieldReadonly,
    isImageFieldMultiple,
    parseApiAutocompleteFieldSettings,
    parseBooleanFieldSettings,
    parseDateFieldSettings,
    parseFieldOptions,
    parseFieldTreeOptions,
    parseHashFieldSettings,
    parseM2aFieldSettings,
    parseNumberFieldSettings,
    parseRelationFieldSettings,
    parseSliderFieldSettings,
    parseStringFieldSettings,
    parseTextareaFieldSettings,
    resolveTranslatedText
    
    
} from '@/lib/collection-field-types';
import type {FieldTreeOptionRow, RelatedCollectionOption} from '@/lib/collection-field-types';
import { filePublicUrl } from '@/lib/files-api';
import { cn } from '@/lib/utils';
import type { AdminFileRow } from '@/types/files';

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

function defaultBooleanChecked(value: DefaultValue): boolean {
    return value === true || value === 1 || value === '1';
}

function toDatetimeLocalValue(
    value: DefaultValue,
    includeSeconds: boolean,
): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const stringValue = String(value);

    if (/^\d{4}-\d{2}-\d{2}T/.test(stringValue)) {
        return includeSeconds
            ? stringValue.slice(0, 19)
            : stringValue.slice(0, 16);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
        return `${stringValue}T00:00${includeSeconds ? ':00' : ''}`;
    }

    const parsedDate = new Date(stringValue);

    if (Number.isNaN(parsedDate.getTime())) {
        return stringValue;
    }

    const pad = (part: number) => String(part).padStart(2, '0');

    const formatted = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;

    return includeSeconds
        ? `${formatted}:${pad(parsedDate.getSeconds())}`
        : formatted;
}

function getPathValue(source: unknown, path: string): unknown {
    if (!path) {
        return source;
    }

    return path.split('.').reduce<unknown>((current, segment) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
            return (current as Record<string, unknown>)[segment];
        }

        return undefined;
    }, source);
}

function FieldNote({
    settings,
    locales,
}: {
    settings?: Record<string, unknown> | null;
    locales: string[];
}) {
    const note = getFieldNote(settings, locales);

    if (!note) {
        return null;
    }

    return <p className="text-muted-foreground text-sm">{note}</p>;
}

function InputWithIcons({
    iconLeft,
    iconRight,
    children,
}: {
    iconLeft?: string;
    iconRight?: string;
    children: ReactNode;
}) {
    if (!iconLeft && !iconRight) {
        return <>{children}</>;
    }

    return (
        <div className="relative flex items-center">
            {iconLeft ? (
                <LucideIconByName
                    name={iconLeft}
                    className="text-muted-foreground pointer-events-none absolute left-3 size-4"
                />
            ) : null}
            <div
                className={cn(
                    'w-full',
                    iconLeft && 'pl-9',
                    iconRight && 'pr-9',
                )}
            >
                {children}
            </div>
            {iconRight ? (
                <LucideIconByName
                    name={iconRight}
                    className="text-muted-foreground pointer-events-none absolute right-3 size-4"
                />
            ) : null}
        </div>
    );
}

function BooleanToggleInput({
    id,
    name,
    defaultChecked,
    settings,
    locales,
    readonly,
}: {
    id: string;
    name: string;
    defaultChecked: boolean;
    settings?: Record<string, unknown> | null;
    locales: string[];
    readonly: boolean;
}) {
    const booleanSettings = parseBooleanFieldSettings(settings);
    const [checked, setChecked] = useState(defaultChecked);
    const onLabel = resolveTranslatedText(booleanSettings.labelOn, locales, 'Yes');
    const offLabel = resolveTranslatedText(
        booleanSettings.labelOff,
        locales,
        'No',
    );

    return (
        <div className="flex items-center gap-3">
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={readonly}
                onClick={() => {
                    if (!readonly) {
                        setChecked((current) => !current);
                    }
                }}
                className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
                    checked ? 'bg-primary' : 'bg-muted',
                    readonly && 'cursor-not-allowed opacity-50',
                )}
            >
                <span
                    className={cn(
                        'pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                        checked ? 'translate-x-5' : 'translate-x-0',
                    )}
                />
            </button>
            <span className="text-sm">{checked ? onLabel : offLabel}</span>
            <input type="hidden" name={name} value={checked ? '1' : '0'} />
        </div>
    );
}

function StaticAutocompleteInput({
    id,
    name,
    settings,
    locales,
    defaultValue,
    readonly,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    locales: string[];
    defaultValue: string;
    readonly: boolean;
}) {
    const listId = useId();
    const stringSettings = parseStringFieldSettings(settings);
    const options = parseFieldOptions(settings).filter(
        (option) => option.value.trim() !== '',
    );
    const placeholder = getFieldPlaceholder(settings, locales);

    return (
        <InputWithIcons
            iconLeft={stringSettings.iconLeft}
            iconRight={stringSettings.iconRight}
        >
            <Input
                id={id}
                name={name}
                list={listId}
                defaultValue={defaultValue}
                placeholder={placeholder}
                readOnly={readonly}
            />
            <datalist id={listId}>
                {options.map((option) => (
                    <option
                        key={option.value}
                        value={option.value}
                        label={option.label || option.value}
                    />
                ))}
            </datalist>
        </InputWithIcons>
    );
}

type ApiSuggestion = { text: string; value: string };

function ApiAutocompleteInput({
    id,
    name,
    settings,
    locales,
    defaultValue,
    readonly,
}: {
    id: string;
    name: string;
    settings?: Record<string, unknown> | null;
    locales: string[];
    defaultValue: string;
    readonly: boolean;
}) {
    const listId = useId();
    const apiSettings = parseApiAutocompleteFieldSettings(settings);
    const placeholder = resolveTranslatedText(
        apiSettings.placeholder,
        locales,
        getFieldPlaceholder(settings, locales),
    );
    const [query, setQuery] = useState(defaultValue);
    const [suggestions, setSuggestions] = useState<ApiSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const lastRequestAtRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchSuggestions = useCallback(
        async (searchTerm: string) => {
            if (!apiSettings.url.trim() || searchTerm.trim() === '') {
                setSuggestions([]);

                return;
            }

            abortControllerRef.current?.abort();
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            const requestUrl = apiSettings.url.replace(
                /\{\{value\}\}/g,
                encodeURIComponent(searchTerm),
            );

            setLoading(true);

            try {
                const response = await fetch(requestUrl, {
                    signal: abortController.signal,
                    headers: { Accept: 'application/json' },
                });

                if (!response.ok) {
                    setSuggestions([]);

                    return;
                }

                const payload = await response.json();
                const results = getPathValue(payload, apiSettings.resultsPath);
                const rows = Array.isArray(results) ? results : [];

                setSuggestions(
                    rows
                        .map((row) => {
                            const text = String(
                                getPathValue(row, apiSettings.textPath) ?? '',
                            );
                            const value = String(
                                getPathValue(row, apiSettings.valuePath) ??
                                    text,
                            );

                            if (!text && !value) {
                                return null;
                            }

                            return { text: text || value, value: value || text };
                        })
                        .filter(
                            (row): row is ApiSuggestion => row !== null,
                        ),
                );
            } catch {
                if (!abortController.signal.aborted) {
                    setSuggestions([]);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setLoading(false);
                }
            }
        },
        [apiSettings],
    );

    useEffect(() => {
        if (!apiSettings.url.trim()) {
            return;
        }

        const delayTimer = window.setTimeout(() => {
            const now = Date.now();

            if (apiSettings.trigger === 'throttle') {
                if (now - lastRequestAtRef.current < apiSettings.rate) {
                    return;
                }

                lastRequestAtRef.current = now;
            }

            void fetchSuggestions(query);
        }, apiSettings.rate);

        return () => window.clearTimeout(delayTimer);
    }, [apiSettings, fetchSuggestions, query]);

    return (
        <div className="space-y-1">
            <InputWithIcons
                iconLeft={apiSettings.iconLeft}
                iconRight={apiSettings.iconRight}
            >
                <Input
                    id={id}
                    name={name}
                    list={listId}
                    value={query}
                    placeholder={placeholder}
                    readOnly={readonly}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </InputWithIcons>
            <datalist id={listId}>
                {suggestions.map((suggestion) => (
                    <option
                        key={`${suggestion.value}-${suggestion.text}`}
                        value={suggestion.value}
                        label={suggestion.text}
                    />
                ))}
            </datalist>
            {loading ? (
                <p className="text-muted-foreground text-xs">Loading…</p>
            ) : null}
            {!apiSettings.url.trim() ? (
                <p className="text-muted-foreground text-xs">
                    Configure an API URL in field settings to enable suggestions.
                </p>
            ) : null}
        </div>
    );
}

function HashFieldInput({
    id,
    name,
    defaultValue,
    settings,
    readonly,
}: {
    id: string;
    name: string;
    defaultValue: string;
    settings?: Record<string, unknown> | null;
    readonly: boolean;
}) {
    const hashSettings = parseHashFieldSettings(settings);
    const displayValue =
        hashSettings.masked && defaultValue
            ? `${defaultValue.slice(0, 8)}…`
            : defaultValue;

    return (
        <>
            <Input
                id={id}
                type="text"
                value={displayValue}
                readOnly
                disabled={readonly}
                className="font-mono"
            />
            <input type="hidden" name={name} value={defaultValue} />
        </>
    );
}

function SliderFieldInput({
    name,
    settings,
    defaultValue,
    readonly,
}: {
    name: string;
    settings?: Record<string, unknown> | null;
    defaultValue: number;
    readonly: boolean;
}) {
    const sliderSettings = parseSliderFieldSettings(settings);
    const initialValue = Number.isFinite(defaultValue)
        ? defaultValue
        : sliderSettings.defaultValue;
    const [value, setValue] = useState(initialValue);

    return (
        <div className="space-y-3">
            <Slider
                min={sliderSettings.min}
                max={sliderSettings.max}
                step={sliderSettings.step}
                value={[value]}
                disabled={readonly}
                onValueChange={(next) => setValue(next[0] ?? sliderSettings.min)}
            />
            {sliderSettings.showValue ? (
                <p className="text-muted-foreground text-sm">{value}</p>
            ) : null}
            <input type="hidden" name={name} value={String(value)} />
        </div>
    );
}

function CheckboxGroupInput({
    name,
    options,
    defaultValues,
    readonly,
}: {
    name: string;
    options: { value: string; label: string }[];
    defaultValues: string[];
    readonly: boolean;
}) {
    const [selectedValues, setSelectedValues] = useState<string[]>(defaultValues);

    const toggleValue = (optionValue: string, checked: boolean) => {
        setSelectedValues((current) => {
            if (checked) {
                return current.includes(optionValue)
                    ? current
                    : [...current, optionValue];
            }

            return current.filter((value) => value !== optionValue);
        });
    };

    return (
        <div className="flex flex-col gap-2">
            {options.map((option) => {
                const checked = selectedValues.includes(option.value);

                return (
                    <label
                        key={option.value}
                        className="flex items-center gap-2 text-sm"
                    >
                        <Checkbox
                            checked={checked}
                            disabled={readonly}
                            onCheckedChange={(next) =>
                                toggleValue(option.value, next === true)
                            }
                        />
                        {option.label || option.value}
                    </label>
                );
            })}
            {selectedValues.map((value) => (
                <input key={value} type="hidden" name={`${name}[]`} value={value} />
            ))}
        </div>
    );
}

function CheckboxGroupTreeNodes({
    nodes,
    depth,
    selectedValues,
    onToggle,
    readonly,
}: {
    nodes: FieldTreeOptionRow[];
    depth: number;
    selectedValues: string[];
    onToggle: (value: string, checked: boolean) => void;
    readonly: boolean;
}) {
    return (
        <>
            {nodes.map((node) => {
                if (node.value.trim() === '' && node.label.trim() === '') {
                    return null;
                }

                const checked = selectedValues.includes(node.value);

                return (
                    <Fragment key={`${depth}-${node.value}`}>
                        <label
                            className="flex items-center gap-2 text-sm"
                            style={{ paddingLeft: depth * 16 }}
                        >
                            <Checkbox
                                checked={checked}
                                disabled={readonly}
                                onCheckedChange={(next) =>
                                    onToggle(node.value, next === true)
                                }
                            />
                            {node.label || node.value}
                        </label>
                        {node.children && node.children.length > 0 ? (
                            <CheckboxGroupTreeNodes
                                nodes={node.children}
                                depth={depth + 1}
                                selectedValues={selectedValues}
                                onToggle={onToggle}
                                readonly={readonly}
                            />
                        ) : null}
                    </Fragment>
                );
            })}
        </>
    );
}

function collectTreeLeafValues(nodes: FieldTreeOptionRow[]): string[] {
    const leafValues: string[] = [];

    for (const node of nodes) {
        if (node.children && node.children.length > 0) {
            leafValues.push(...collectTreeLeafValues(node.children));
            continue;
        }

        if (node.value.trim() !== '') {
            leafValues.push(node.value);
        }
    }

    return leafValues;
}

function CheckboxGroupTreeInput({
    name,
    settings,
    defaultValues,
    readonly,
}: {
    name: string;
    settings?: Record<string, unknown> | null;
    defaultValues: string[];
    readonly: boolean;
}) {
    const treeOptions = parseFieldTreeOptions(settings);
    const valueCombining = String(settings?.value_combining ?? 'all');
    const [selectedValues, setSelectedValues] =
        useState<string[]>(defaultValues);

    const toggleValue = (optionValue: string, checked: boolean) => {
        setSelectedValues((current) => {
            if (checked) {
                return current.includes(optionValue)
                    ? current
                    : [...current, optionValue];
            }

            return current.filter((value) => value !== optionValue);
        });
    };

    const storedValues =
        valueCombining === 'leaf'
            ? selectedValues.filter((value) =>
                  collectTreeLeafValues(treeOptions).includes(value),
              )
            : selectedValues;

    return (
        <div className="flex flex-col gap-2">
            <CheckboxGroupTreeNodes
                nodes={treeOptions}
                depth={0}
                selectedValues={selectedValues}
                onToggle={toggleValue}
                readonly={readonly}
            />
            {storedValues.map((value) => (
                <input key={value} type="hidden" name={`${name}[]`} value={value} />
            ))}
        </div>
    );
}

function FileFieldInput({
    name,
    defaultFileId,
    acceptImagesOnly = false,
    readonly = false,
}: {
    name: string;
    defaultFileId: number | null;
    acceptImagesOnly?: boolean;
    readonly?: boolean;
}) {
    const [fileId, setFileId] = useState<number | null>(defaultFileId);
    const [preview, setPreview] = useState<AdminFileRow | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    return (
        <div className="space-y-2">
            <input type="hidden" name={name} value={fileId ?? ''} />
            {preview && (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                    {filePublicUrl(preview) ? (
                        <img
                            src={filePublicUrl(preview)!}
                            alt={preview.name}
                            className="size-12 rounded object-cover"
                        />
                    ) : null}
                    <span className="text-sm font-medium">{preview.name}</span>
                </div>
            )}
            {!preview && fileId && (
                <p className="text-muted-foreground text-sm">File #{fileId}</p>
            )}
            {!readonly ? (
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerOpen(true)}
                    >
                        {fileId ? 'Change file' : 'Choose file'}
                    </Button>
                    {fileId !== null && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setFileId(null);
                                setPreview(null);
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </div>
            ) : null}
            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={acceptImagesOnly ? 'Choose image' : 'Choose file'}
                onSelect={(file) => {
                    setFileId(file.id);
                    setPreview(file);
                }}
            />
        </div>
    );
}

function MultipleFilesFieldInput({
    name,
    defaultFileIds,
    acceptImagesOnly = false,
    readonly = false,
}: {
    name: string;
    defaultFileIds: number[];
    acceptImagesOnly?: boolean;
    readonly?: boolean;
}) {
    const [fileIds, setFileIds] = useState<number[]>(defaultFileIds);
    const [pickerOpen, setPickerOpen] = useState(false);

    return (
        <div className="space-y-2">
            {fileIds.map((fileId) => (
                <input key={fileId} type="hidden" name={`${name}[]`} value={fileId} />
            ))}
            {fileIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {fileIds.map((fileId) => (
                        <Badge key={fileId} variant="secondary">
                            File #{fileId}
                            {!readonly ? (
                                <button
                                    type="button"
                                    className="ml-2 text-xs underline"
                                    onClick={() =>
                                        setFileIds((current) =>
                                            current.filter(
                                                (currentId) =>
                                                    currentId !== fileId,
                                            ),
                                        )
                                    }
                                >
                                    Remove
                                </button>
                            ) : null}
                        </Badge>
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground text-sm">No files selected</p>
            )}
            {!readonly ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                >
                    Add {acceptImagesOnly ? 'image' : 'file'}
                </Button>
            ) : null}
            <FilePickerDrawer
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                acceptImagesOnly={acceptImagesOnly}
                title={acceptImagesOnly ? 'Choose image' : 'Choose file'}
                onSelect={(file) => {
                    setFileIds((current) =>
                        current.includes(file.id)
                            ? current
                            : [...current, file.id],
                    );
                }}
            />
        </div>
    );
}

function RelationFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    multiple = false,
    readonly = false,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: number | number[] | null;
    multiple?: boolean;
    readonly?: boolean;
}) {
    const relationSettings = parseRelationFieldSettings(field.settings);
    const fetchUrl = `/collections/${collectionId}/items/options?field_id=${field.id}`;
    const initialIds = multiple
        ? Array.isArray(defaultValue)
            ? defaultValue
            : []
        : typeof defaultValue === 'number'
          ? [defaultValue]
          : [];

    const [selectedIds, setSelectedIds] = useState<number[]>(initialIds);
    const [initialOptions, setInitialOptions] = useState<
        { id: number; label: string }[]
    >([]);

    useEffect(() => {
        if (initialIds.length === 0) {
            return;
        }

        const params = new URLSearchParams({
            field_id: String(field.id),
            per_page: '100',
        });

        void fetch(`/collections/${collectionId}/items/options?${params}`, {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!payload || !Array.isArray(payload.data)) {
                    return;
                }

                const options = payload.data
                    .filter((row: { id: number }) => initialIds.includes(row.id))
                    .map((row: { id: number; label?: string }) => ({
                        id: row.id,
                        label: row.label ?? `#${row.id}`,
                    }));

                setInitialOptions(options);
            })
            .catch(() => undefined);
    }, [collectionId, field.id, initialIds]);

    return (
        <div className="space-y-2">
            {multiple ? (
                selectedIds.map((selectedId) => (
                    <input
                        key={selectedId}
                        type="hidden"
                        name={`${name}[]`}
                        value={selectedId}
                    />
                ))
            ) : (
                <input
                    type="hidden"
                    name={name}
                    value={selectedIds[0] ?? ''}
                />
            )}
            <PaginatedMultiSelect
                fetchUrl={fetchUrl}
                value={selectedIds}
                disabled={readonly}
                multiple={multiple}
                initialOptions={initialOptions}
                onChange={(next) => setSelectedIds(next)}
                placeholder={
                    relationSettings.displayField
                        ? `Select by ${relationSettings.displayField}…`
                        : 'Select related item…'
                }
            />
        </div>
    );
}

type M2aBlock = {
    related_collection_id: number;
    related_item_id: number;
};

function M2aFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    readonly,
    relatedCollections,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: unknown;
    readonly: boolean;
    relatedCollections: RelatedCollectionOption[];
}) {
    const m2aSettings = parseM2aFieldSettings(field.settings);
    const allowedCollections = relatedCollections.filter((collection) =>
        m2aSettings.allowedCollectionIds.includes(collection.id),
    );

    const [blocks, setBlocks] = useState<M2aBlock[]>(() => {
        if (!Array.isArray(defaultValue)) {
            return [];
        }

        return defaultValue.filter(
            (entry): entry is M2aBlock =>
                Boolean(entry) &&
                typeof entry === 'object' &&
                isFiniteNumber(
                    (entry as { related_collection_id?: unknown })
                        .related_collection_id,
                ) &&
                isFiniteNumber(
                    (entry as { related_item_id?: unknown }).related_item_id,
                ),
        );
    });

    const addBlock = () => {
        const firstCollection = allowedCollections[0];

        if (!firstCollection) {
            return;
        }

        setBlocks((current) => [
            ...current,
            {
                related_collection_id: firstCollection.id,
                related_item_id: 0,
            },
        ]);
    };

    const updateBlock = (index: number, patch: Partial<M2aBlock>) => {
        setBlocks((current) =>
            current.map((block, blockIndex) =>
                blockIndex === index ? { ...block, ...patch } : block,
            ),
        );
    };

    const removeBlock = (index: number) => {
        setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index));
    };

    const moveBlock = (index: number, direction: -1 | 1) => {
        setBlocks((current) => {
            const targetIndex = index + direction;

            if (targetIndex < 0 || targetIndex >= current.length) {
                return current;
            }

            const next = [...current];
            const [moved] = next.splice(index, 1);
            next.splice(targetIndex, 0, moved);

            return next;
        });
    };

    return (
        <div className="space-y-3">
            {blocks.map((block, blockIndex) => {
                const fetchUrl = `/collections/${collectionId}/items/options?field_id=${field.id}&related_collection_id=${block.related_collection_id}`;
                const selectedIds =
                    block.related_item_id > 0 ? [block.related_item_id] : [];

                return (
                    <div
                        key={`${blockIndex}-${block.related_collection_id}`}
                        className="space-y-2 rounded-lg border p-3"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                className={cn(inputLike, 'max-w-xs')}
                                value={block.related_collection_id}
                                disabled={readonly}
                                onChange={(event) =>
                                    updateBlock(blockIndex, {
                                        related_collection_id: Number(
                                            event.target.value,
                                        ),
                                        related_item_id: 0,
                                    })
                                }
                            >
                                {allowedCollections.map((collection) => (
                                    <option key={collection.id} value={collection.id}>
                                        {collection.name}
                                    </option>
                                ))}
                            </select>
                            {!readonly ? (
                                <div className="flex gap-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => moveBlock(blockIndex, -1)}
                                    >
                                        Up
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => moveBlock(blockIndex, 1)}
                                    >
                                        Down
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeBlock(blockIndex)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        <PaginatedMultiSelect
                            fetchUrl={fetchUrl}
                            value={selectedIds}
                            disabled={readonly}
                            multiple={false}
                            onChange={(next) =>
                                updateBlock(blockIndex, {
                                    related_item_id: next[0] ?? 0,
                                })
                            }
                            placeholder="Select block item…"
                        />
                    </div>
                );
            })}
            {blocks
                .filter((block) => block.related_item_id > 0)
                .map((block, index) => (
                    <Fragment key={`submit-${index}-${block.related_item_id}`}>
                        <input
                            type="hidden"
                            name={`${name}[${index}][related_collection_id]`}
                            value={block.related_collection_id}
                        />
                        <input
                            type="hidden"
                            name={`${name}[${index}][related_item_id]`}
                            value={block.related_item_id}
                        />
                    </Fragment>
                ))}
            {!readonly ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={allowedCollections.length === 0}
                    onClick={addBlock}
                >
                    Add block
                </Button>
            ) : null}
            {blocks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No blocks yet.</p>
            ) : null}
        </div>
    );
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
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
        .map((entry) => Number(entry))
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
                    className={cn(inputLike, 'min-h-[120px] py-2')}
                    defaultValue={String(defaultValue ?? '')}
                    rows={textareaSettings.rows}
                    placeholder={resolveTranslatedText(
                        textareaSettings.placeholder,
                        locales,
                        placeholder,
                    )}
                    readOnly={readonly}
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
        case 'select':
            return (
                <select
                    id={id}
                    name={name}
                    className={inputLike}
                    defaultValue={String(defaultValue ?? '')}
                    disabled={readonly}
                >
                    <option value="">—</option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label || option.value}
                        </option>
                    ))}
                </select>
            );
        case 'multiselect':
            return (
                <select
                    id={id}
                    name={`${name}[]`}
                    className={inputLike}
                    multiple
                    defaultValue={toStringArray(defaultValue)}
                    disabled={readonly}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label || option.value}
                        </option>
                    ))}
                </select>
            );
        case 'checkbox_group':
            return (
                <CheckboxGroupInput
                    name={name}
                    options={options}
                    defaultValues={toStringArray(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'checkbox_group_tree':
            return (
                <CheckboxGroupTreeInput
                    name={name}
                    settings={field.settings}
                    defaultValues={toStringArray(defaultValue)}
                    readonly={readonly}
                />
            );
        case 'radio_group':
            return (
                <div className="flex flex-col gap-2">
                    {options.map((option) => (
                        <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm"
                        >
                            <input
                                type="radio"
                                name={name}
                                value={option.value}
                                defaultChecked={
                                    String(defaultValue) === option.value
                                }
                                disabled={readonly}
                            />
                            {option.label || option.value}
                        </label>
                    ))}
                </div>
            );
        case 'date': {
            const dateSettings = parseDateFieldSettings(field.settings);

            return (
                <Input
                    id={id}
                    type="datetime-local"
                    name={name}
                    step={dateSettings.includeSeconds ? 1 : 60}
                    defaultValue={toDatetimeLocalValue(
                        defaultValue,
                        dateSettings.includeSeconds,
                    )}
                    readOnly={readonly}
                />
            );
        }
        case 'map':
            return (
                <MapCoordinateInput
                    idPrefix={id}
                    nameBase={name}
                    defaultValue={defaultValue}
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
        case 'relation_many':
        case 'one_to_many':
        case 'many_to_many':
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
        default:
            return (
                <Input
                    id={id}
                    type="text"
                    name={name}
                    defaultValue={String(defaultValue ?? '')}
                    placeholder={placeholder}
                    readOnly={readonly}
                />
            );
    }
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
}: {
    fields: FieldDef[];
    locales: string[];
    defaults?: Record<string, unknown>;
    collectionId: number;
    relatedCollections?: RelatedCollectionOption[];
    variant?: 'plain' | 'cards';
    fieldActions?: (field: FieldDef) => ReactNode;
}) {
    const showFieldNameHeading = variant === 'plain';
    const gapClass = variant === 'cards' ? 'space-y-4' : 'space-y-6';

    return (
        <div className={gapClass}>
            {fields.map((field) => {
                const displayName = getFieldDisplayName(
                    field.settings,
                    field.name,
                    locales,
                );
                const readonly = isFieldReadonly(field.settings);

                const inner = field.translatable ? (
                    <div className="space-y-3">
                        {showFieldNameHeading && (
                            <p className="text-sm font-medium">{displayName}</p>
                        )}
                        <FieldNote settings={field.settings} locales={locales} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            {locales.map((locale) => {
                                const inputId = `data_${field.name}_${locale}`;

                                return (
                                    <div key={locale} className="grid gap-2">
                                        <Label htmlFor={inputId}>
                                            {displayName} ({locale})
                                        </Label>
                                        {renderFieldControl({
                                            field,
                                            name: `data[${field.name}][${locale}]`,
                                            id: inputId,
                                            collectionId,
                                            locales,
                                            readonly,
                                            relatedCollections,
                                            defaultValue: getDefaultLocale(
                                                defaults,
                                                field.name,
                                                locale,
                                            ),
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-2">
                        {showFieldNameHeading && (
                            <Label htmlFor={`data_${field.name}`}>
                                {displayName}
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
                            defaultValue: getDefaultScalar(
                                defaults,
                                field.name,
                            ),
                        })}
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
                                        {displayName}
                                    </span>
                                    <Badge variant="outline">{field.type}</Badge>
                                    {field.translatable && (
                                        <Badge variant="secondary">
                                            Translatable
                                        </Badge>
                                    )}
                                    {readonly && (
                                        <Badge variant="secondary">Readonly</Badge>
                                    )}
                                </div>
                                {fieldActions?.(field)}
                            </div>
                            {inner}
                        </div>
                    );
                }

                return <Fragment key={field.id}>{inner}</Fragment>;
            })}
        </div>
    );
}
