import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
} from 'react';

import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
    getFieldNote,
    getFieldPlaceholder,
    parseApiAutocompleteFieldSettings,
    parseBooleanFieldSettings,
    parseFieldOptions,
    parseFieldTreeOptions,
    parseHashFieldSettings,
    parseSliderFieldSettings,
    parseStringFieldSettings,
    resolveTranslatedText,
    type FieldTreeOptionRow,
} from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

type DefaultValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;

export function defaultBooleanChecked(value: DefaultValue): boolean {
    return value === true || value === 1 || value === '1';
}

export function toDatetimeLocalValue(
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

export function toDateInputValue(value: DefaultValue): string {
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

export function toTimeInputValue(value: DefaultValue, includeSeconds: boolean): string {
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

export function FieldNote({
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

export function InputWithIcons({
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

export function BooleanToggleInput({
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

export function StaticAutocompleteInput({
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

export function ApiAutocompleteInput({
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

export function HashFieldInput({
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

export function SliderFieldInput({
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

export function CheckboxGroupInput({
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

export function SelectWithOtherInput({
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

export function RadioWithOtherInput({
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

export function MultiselectWithOtherInput({
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

export function CheckboxGroupTreeInput({
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
