import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import type {ReactNode} from 'react';

import { FilePickerDrawer } from '@/components/admin/file-picker-drawer';
import { PaginatedMultiSelect } from '@/components/admin/paginated-multi-select';
import { ContentLocaleProvider } from '@/components/collections/content-locale-provider';
import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import { LocalizedField } from '@/components/collections/localized-field';
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
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    getFieldDisplayName,
    getFieldNote,
    getFieldPlaceholder,
    groupFieldsIntoLayoutRows,
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
    parseSelectFieldSettings,
    parseSliderFieldSettings,
    parseStringFieldSettings,
    parseTextareaFieldSettings,
    resolveTranslatedText,
} from '@/lib/collection-field-types';
import type {FieldTreeOptionRow, RelatedCollectionOption} from '@/lib/collection-field-types';
import {
    parseCollectionFormLayout,
    resolveFormLayoutGroups,
    resolveFormLayoutLabel,
} from '@/lib/collection-form-layout';
import { evaluateFieldFlags } from '@/lib/field-conditions';
import { filePublicUrl } from '@/lib/files-api';
import { cn } from '@/lib/utils';
import type { AdminFileRow } from '@/types/files';
import { ChevronDown } from 'lucide-react';

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

function toDateInputValue(value: DefaultValue): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const stringValue = String(value);

    if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) {
        return stringValue.slice(0, 10);
    }

    const parsedDate = new Date(stringValue);

    if (Number.isNaN(parsedDate.getTime())) {
        return stringValue;
    }

    const pad = (part: number) => String(part).padStart(2, '0');

    return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
}

function toTimeInputValue(value: DefaultValue, includeSeconds: boolean): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const stringValue = String(value);

    if (/^\d{2}:\d{2}/.test(stringValue)) {
        return includeSeconds ? stringValue.slice(0, 8) : stringValue.slice(0, 5);
    }

    if (/T\d{2}:\d{2}/.test(stringValue)) {
        const timePart = stringValue.split('T')[1] ?? '';

        return includeSeconds ? timePart.slice(0, 8) : timePart.slice(0, 5);
    }

    return stringValue;
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
        <div className="space-y-1">
            <Input
                id={id}
                type="text"
                value={displayValue || 'Generated on save'}
                readOnly
                disabled={readonly}
                className="font-mono"
            />
            <input type="hidden" name={name} value={defaultValue} />
            <p className="text-muted-foreground text-xs">
                Fingerprint ID (auto). Not a password hash.
            </p>
        </div>
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
    allowOther = false,
}: {
    name: string;
    options: { value: string; label: string }[];
    defaultValues: string[];
    readonly: boolean;
    allowOther?: boolean;
}) {
    const optionValues = options.map((option) => option.value);
    const initialOther = defaultValues.find(
        (value) => !optionValues.includes(value),
    );
    const [selectedValues, setSelectedValues] = useState<string[]>(
        defaultValues.filter((value) => optionValues.includes(value)),
    );
    const [otherEnabled, setOtherEnabled] = useState(Boolean(initialOther));
    const [otherValue, setOtherValue] = useState(initialOther ?? '');

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

    const storedValues = [
        ...selectedValues,
        ...(allowOther && otherEnabled && otherValue.trim() !== ''
            ? [otherValue.trim()]
            : []),
    ];

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
            {allowOther ? (
                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={otherEnabled}
                            disabled={readonly}
                            onCheckedChange={(next) =>
                                setOtherEnabled(next === true)
                            }
                        />
                        Other
                    </label>
                    {otherEnabled ? (
                        <Input
                            value={otherValue}
                            readOnly={readonly}
                            placeholder="Custom value"
                            onChange={(event) => setOtherValue(event.target.value)}
                        />
                    ) : null}
                </div>
            ) : null}
            {storedValues.map((value) => (
                <input key={value} type="hidden" name={`${name}[]`} value={value} />
            ))}
        </div>
    );
}

function SelectWithOtherInput({
    id,
    name,
    options,
    defaultValue,
    readonly,
    allowNone,
    allowOther,
}: {
    id: string;
    name: string;
    options: { value: string; label: string }[];
    defaultValue: string;
    readonly: boolean;
    allowNone: boolean;
    allowOther: boolean;
}) {
    const optionValues = options.map((option) => option.value);
    const initialIsOther =
        allowOther &&
        defaultValue !== '' &&
        !optionValues.includes(defaultValue);
    const [mode, setMode] = useState<'option' | 'other'>(
        initialIsOther ? 'other' : 'option',
    );
    const [optionValue, setOptionValue] = useState(
        initialIsOther ? '' : defaultValue,
    );
    const [otherValue, setOtherValue] = useState(
        initialIsOther ? defaultValue : '',
    );

    const submitted =
        mode === 'other' ? otherValue : optionValue;

    return (
        <div className="space-y-2">
            <select
                id={id}
                className={inputLike}
                value={mode === 'other' ? '__other__' : optionValue}
                disabled={readonly}
                onChange={(event) => {
                    if (event.target.value === '__other__') {
                        setMode('other');

                        return;
                    }

                    setMode('option');
                    setOptionValue(event.target.value);
                }}
            >
                {allowNone ? <option value="">—</option> : null}
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label || option.value}
                    </option>
                ))}
                {allowOther ? <option value="__other__">Other…</option> : null}
            </select>
            {mode === 'other' ? (
                <Input
                    value={otherValue}
                    readOnly={readonly}
                    placeholder="Custom value"
                    onChange={(event) => setOtherValue(event.target.value)}
                />
            ) : null}
            <input type="hidden" name={name} value={submitted} />
        </div>
    );
}

function RadioWithOtherInput({
    name,
    options,
    defaultValue,
    readonly,
    allowOther,
}: {
    name: string;
    options: { value: string; label: string }[];
    defaultValue: string;
    readonly: boolean;
    allowOther: boolean;
}) {
    const optionValues = options.map((option) => option.value);
    const initialIsOther =
        allowOther &&
        defaultValue !== '' &&
        !optionValues.includes(defaultValue);
    const [selected, setSelected] = useState(
        initialIsOther ? '__other__' : defaultValue,
    );
    const [otherValue, setOtherValue] = useState(
        initialIsOther ? defaultValue : '',
    );

    const submitted =
        selected === '__other__' ? otherValue : selected;

    return (
        <div className="flex flex-col gap-2">
            {options.map((option) => (
                <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm"
                >
                    <input
                        type="radio"
                        name={`${name}__ui`}
                        value={option.value}
                        checked={selected === option.value}
                        disabled={readonly}
                        onChange={() => setSelected(option.value)}
                    />
                    {option.label || option.value}
                </label>
            ))}
            {allowOther ? (
                <label className="flex flex-col gap-2 text-sm">
                    <span className="flex items-center gap-2">
                        <input
                            type="radio"
                            name={`${name}__ui`}
                            value="__other__"
                            checked={selected === '__other__'}
                            disabled={readonly}
                            onChange={() => setSelected('__other__')}
                        />
                        Other
                    </span>
                    {selected === '__other__' ? (
                        <Input
                            value={otherValue}
                            readOnly={readonly}
                            placeholder="Custom value"
                            onChange={(event) => setOtherValue(event.target.value)}
                        />
                    ) : null}
                </label>
            ) : null}
            <input type="hidden" name={name} value={submitted} />
        </div>
    );
}

function MultiselectWithOtherInput({
    name,
    options,
    defaultValues,
    readonly,
    allowOther,
}: {
    name: string;
    options: { value: string; label: string }[];
    defaultValues: string[];
    readonly: boolean;
    allowOther: boolean;
}) {
    const optionValues = options.map((option) => option.value);
    const initialOther = defaultValues.find(
        (value) => !optionValues.includes(value),
    );
    const [selected, setSelected] = useState(
        defaultValues.filter((value) => optionValues.includes(value)),
    );
    const [otherValue, setOtherValue] = useState(initialOther ?? '');

    const stored = [
        ...selected,
        ...(allowOther && otherValue.trim() !== '' ? [otherValue.trim()] : []),
    ];

    return (
        <div className="space-y-2">
            <select
                className={inputLike}
                multiple
                value={selected}
                disabled={readonly}
                onChange={(event) => {
                    setSelected(
                        Array.from(event.target.selectedOptions).map(
                            (option) => option.value,
                        ),
                    );
                }}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label || option.value}
                    </option>
                ))}
            </select>
            {allowOther ? (
                <Input
                    value={otherValue}
                    readOnly={readonly}
                    placeholder="Additional custom value"
                    onChange={(event) => setOtherValue(event.target.value)}
                />
            ) : null}
            {stored.map((value) => (
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
}: {
    field: FieldDef;
    locales: string[];
    displayName: string;
    showFieldNameHeading: boolean;
    readonly: boolean;
    collectionId: number;
    relatedCollections: RelatedCollectionOption[];
    defaults?: Record<string, unknown>;
}) {
    return (
        <LocalizedField
            locales={locales}
            label={showFieldNameHeading ? displayName : undefined}
            showCopyActions={false}
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
}: {
    fields: FieldDef[];
    locales: string[];
    defaults?: Record<string, unknown>;
    collectionId: number;
    relatedCollections?: RelatedCollectionOption[];
    variant?: 'plain' | 'cards';
    fieldActions?: (field: FieldDef) => ReactNode;
    formLayout?: Record<string, unknown> | null;
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

                return !schemaHidden;
            }),
        [fields],
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
        const readonly = flags.readonly;

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

                    // ponytail: listen at wrapper for condition re-eval (ceiling: no deep controlled tree)
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
                                <Badge variant="secondary">Translatable</Badge>
                            )}
                            {readonly && (
                                <Badge variant="secondary">Readonly</Badge>
                            )}
                            {flags.required && (
                                <Badge variant="secondary">Required</Badge>
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
                    if (!section || section.id === 'unsectioned' && !layout) {
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
