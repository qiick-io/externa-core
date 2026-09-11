import { ChevronDown, ChevronRight } from 'lucide-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';

import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
    cascadeToggleValues,
    collectExpandableKeys,
    collectTreeLeafValues,
    getTreeNodeCheckState,
} from '@/lib/checkbox-group-tree';
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
} from '@/lib/collection-field-types';
import type { FieldTreeOptionRow } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

/** Radix Select forbids empty string values — map allowNone ↔ sentinel. */
const SELECT_NONE_VALUE = '__none__';
const SELECT_OTHER_VALUE = '__other__';

/** Shared border/ring chrome for naked choice controls (boolean, checkbox group, radio, tree, slider). */
const choiceFieldChromeBase =
    'w-full rounded-md border border-input bg-transparent shadow-xs has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-inset';

/** Single-line choice chrome — matches Input h-9 (36px). */
const choiceFieldChromeSingle = cn(
    choiceFieldChromeBase,
    'flex h-9 min-h-9 items-center px-3',
);

/** Multi-option / growing chrome — tight padding, height follows content. */
const choiceFieldChrome = cn(choiceFieldChromeBase, 'px-3 py-1.5');

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

export function toTimeInputValue(
    value: DefaultValue,
    includeSeconds: boolean,
): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const stringValue = String(value);

    if (/^\d{2}:\d{2}/.test(stringValue)) {
        return includeSeconds
            ? stringValue.slice(0, 8)
            : stringValue.slice(0, 5);
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

/**
 * Always reserves one line of vertical space below the control so half-width siblings stay aligned.
 */
export function FieldNoteSlot({ note }: { note?: string }) {
    return (
        <p
            className="min-h-5 text-sm text-muted-foreground"
            aria-hidden={!note}
        >
            {note || '\u00A0'}
        </p>
    );
}

export function FieldNote({
    settings,
    locales,
    reserveSpace = false,
}: {
    settings?: Record<string, unknown> | null;
    locales: string[];
    /** When true, always render a one-line slot even if note is empty. */
    reserveSpace?: boolean;
}) {
    const note = getFieldNote(settings, locales);

    if (!note && !reserveSpace) {
        return null;
    }

    return <FieldNoteSlot note={note} />;
}

/**
 * Antd-style Input.Group: icon in a bordered addon flush to the input (not floating inside).
 */
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

    const addonClass =
        'inline-flex h-9 w-9 shrink-0 items-center justify-center border border-input bg-muted/50 text-muted-foreground';

    return (
        <div className="flex w-full items-stretch">
            {iconLeft ? (
                <span
                    className={cn(addonClass, 'rounded-l-md border-r-0')}
                    aria-hidden
                >
                    <LucideIconByName name={iconLeft} className="size-4" />
                </span>
            ) : null}
            <div
                className={cn(
                    'min-w-0 flex-1',
                    // strip input corners where they meet the addon
                    iconLeft &&
                        '[&_[data-slot=input]]:rounded-l-none [&_button]:rounded-l-none [&_input]:rounded-l-none [&_select]:rounded-l-none [&_textarea]:rounded-l-none',
                    iconRight &&
                        '[&_[data-slot=input]]:rounded-r-none [&_button]:rounded-r-none [&_input]:rounded-r-none [&_select]:rounded-r-none [&_textarea]:rounded-r-none',
                )}
            >
                {children}
            </div>
            {iconRight ? (
                <span
                    className={cn(addonClass, 'rounded-r-md border-l-0')}
                    aria-hidden
                >
                    <LucideIconByName name={iconRight} className="size-4" />
                </span>
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
    onCheckedChange,
}: {
    id: string;
    name: string;
    defaultChecked: boolean;
    settings?: Record<string, unknown> | null;
    locales: string[];
    readonly: boolean;
    /** Notify parent (conditions / formValues) — hidden input alone does not bubble change. */
    onCheckedChange?: (checked: boolean) => void;
}) {
    const booleanSettings = parseBooleanFieldSettings(settings);
    const [checked, setChecked] = useState(defaultChecked);
    // Directus boolean: checkbox + fixed affirmative label (not a Yes/No flip).
    const onLabel = resolveTranslatedText(
        booleanSettings.labelOn,
        locales,
        'Yes',
    );

    return (
        <label
            htmlFor={id}
            className={cn(
                choiceFieldChromeSingle,
                'cursor-pointer gap-3',
                readonly && 'cursor-not-allowed opacity-50',
            )}
        >
            <Checkbox
                id={id}
                checked={checked}
                disabled={readonly}
                onCheckedChange={(next) => {
                    if (readonly || next === 'indeterminate') {
                        return;
                    }

                    setChecked(next);
                    onCheckedChange?.(next);
                }}
            />
            <span
                className={cn(
                    'truncate text-sm leading-none',
                    checked && 'text-primary',
                )}
            >
                {onLabel}
            </span>
            <input type="hidden" name={name} value={checked ? '1' : '0'} />
        </label>
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
    const containerRef = useRef<HTMLDivElement>(null);
    const apiSettings = parseApiAutocompleteFieldSettings(settings);
    // ponytail: primitives only — parseApiAutocompleteFieldSettings() returns a
    // new object each render; putting it in effect deps re-fired the debounce forever.
    const {
        url,
        resultsPath,
        textPath,
        valuePath,
        trigger,
        rate,
        iconLeft,
        iconRight,
    } = apiSettings;
    const placeholder = resolveTranslatedText(
        apiSettings.placeholder,
        locales,
        getFieldPlaceholder(settings, locales),
    );
    const [query, setQuery] = useState(defaultValue);
    const [suggestions, setSuggestions] = useState<ApiSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const lastRequestAtRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    /** When set, matches `query` after picking a suggestion — skip refetch until the user types. */
    const committedSelectionRef = useRef<string | null>(null);

    const fetchSuggestions = useCallback(
        async (searchTerm: string) => {
            if (!url.trim() || searchTerm.trim() === '') {
                setSuggestions([]);
                setOpen(false);

                return;
            }

            abortControllerRef.current?.abort();
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            const requestUrl = url.replace(
                /\{\{value\}\}/g,
                encodeURIComponent(searchTerm),
            );

            setLoading(true);

            try {
                const response = await fetch(requestUrl, {
                    signal: abortController.signal,
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    setSuggestions([]);
                    setOpen(false);

                    return;
                }

                const payload = await response.json();
                const results = getPathValue(payload, resultsPath);
                const rows = Array.isArray(results) ? results : [];

                const next = rows
                    .map((row) => {
                        const text = String(getPathValue(row, textPath) ?? '');
                        const value = String(
                            getPathValue(row, valuePath) ?? text,
                        );

                        if (!text && !value) {
                            return null;
                        }

                        return {
                            text: text || value,
                            value: value || text,
                        };
                    })
                    .filter((row): row is ApiSuggestion => row !== null);

                setSuggestions(next);
                setOpen(next.length > 0);
            } catch {
                if (!abortController.signal.aborted) {
                    setSuggestions([]);
                    setOpen(false);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setLoading(false);
                }
            }
        },
        [url, resultsPath, textPath, valuePath],
    );

    useEffect(() => {
        if (!url.trim()) {
            return;
        }

        // Selecting an option updates `query` — don't re-fetch until the user types again.
        if (committedSelectionRef.current === query) {
            return;
        }

        committedSelectionRef.current = null;

        const delayTimer = window.setTimeout(() => {
            if (trigger === 'throttle') {
                const now = Date.now();

                if (now - lastRequestAtRef.current < rate) {
                    return;
                }

                lastRequestAtRef.current = now;
            }

            void fetchSuggestions(query);
        }, rate);

        return () => window.clearTimeout(delayTimer);
    }, [url, trigger, rate, fetchSuggestions, query]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', onPointerDown);

        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    return (
        <div className="relative space-y-1" ref={containerRef}>
            <InputWithIcons iconLeft={iconLeft} iconRight={iconRight}>
                <Input
                    id={id}
                    name={name}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    autoComplete="off"
                    value={query}
                    placeholder={placeholder}
                    readOnly={readonly}
                    onChange={(event) => {
                        committedSelectionRef.current = null;
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => {
                        if (suggestions.length > 0) {
                            setOpen(true);
                        }
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            setOpen(false);
                        }
                    }}
                />
            </InputWithIcons>
            {open && suggestions.length > 0 ? (
                <ul
                    id={listId}
                    role="listbox"
                    className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover p-1 text-sm shadow-md"
                >
                    {suggestions.map((suggestion) => (
                        <li
                            key={`${suggestion.value}-${suggestion.text}`}
                            role="option"
                        >
                            <button
                                type="button"
                                className="flex w-full cursor-pointer rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    committedSelectionRef.current =
                                        suggestion.value;
                                    setQuery(suggestion.value);
                                    setOpen(false);
                                    setSuggestions([]);
                                }}
                            >
                                {suggestion.text}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {loading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
            ) : null}
            {!url.trim() ? (
                <p className="text-xs text-muted-foreground">
                    Configure an API URL in field settings to enable
                    suggestions.
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
            <p className="text-xs text-muted-foreground">
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
        <div
            className={cn(
                sliderSettings.showValue
                    ? cn('flex flex-col gap-1.5', choiceFieldChrome)
                    : choiceFieldChromeSingle,
            )}
        >
            <Slider
                min={sliderSettings.min}
                max={sliderSettings.max}
                step={sliderSettings.step}
                value={[value]}
                disabled={readonly}
                onValueChange={(next) =>
                    setValue(next[0] ?? sliderSettings.min)
                }
            />
            {sliderSettings.showValue ? (
                <p className="text-sm leading-none text-muted-foreground">
                    {value}
                </p>
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
        <div className={cn('flex flex-col gap-2', choiceFieldChrome)}>
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
                            onChange={(event) =>
                                setOtherValue(event.target.value)
                            }
                        />
                    ) : null}
                </div>
            ) : null}
            {storedValues.map((value) => (
                <input
                    key={value}
                    type="hidden"
                    name={`${name}[]`}
                    value={value}
                />
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
    const hiddenRef = useRef<HTMLInputElement>(null);

    const submitted = mode === 'other' ? otherValue : optionValue;

    // Sync hidden input + bubble `input` so blocks sibling conditions still re-eval
    // without a native <select> change event.
    const syncHidden = (next: string): void => {
        if (!hiddenRef.current) {
            return;
        }

        hiddenRef.current.value = next;
        hiddenRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const selectValue =
        mode === 'other'
            ? SELECT_OTHER_VALUE
            : optionValue === ''
              ? allowNone
                  ? SELECT_NONE_VALUE
                  : undefined
              : optionValue;

    return (
        <div className="space-y-2">
            <Select
                value={selectValue}
                disabled={readonly}
                onValueChange={(value) => {
                    if (value === SELECT_OTHER_VALUE) {
                        setMode('other');

                        return;
                    }

                    const next = value === SELECT_NONE_VALUE ? '' : value;
                    setMode('option');
                    setOptionValue(next);
                    syncHidden(next);
                }}
            >
                <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder={allowNone ? '—' : 'Select…'} />
                </SelectTrigger>
                <SelectContent>
                    {allowNone ? (
                        <SelectItem value={SELECT_NONE_VALUE}>—</SelectItem>
                    ) : null}
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label || option.value}
                        </SelectItem>
                    ))}
                    {allowOther ? (
                        <SelectItem value={SELECT_OTHER_VALUE}>
                            Other…
                        </SelectItem>
                    ) : null}
                </SelectContent>
            </Select>
            {mode === 'other' ? (
                <Input
                    value={otherValue}
                    readOnly={readonly}
                    placeholder="Custom value"
                    onChange={(event) => {
                        const next = event.target.value;
                        setOtherValue(next);
                        syncHidden(next);
                    }}
                />
            ) : null}
            <input
                ref={hiddenRef}
                type="hidden"
                name={name}
                value={submitted}
            />
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

    const submitted = selected === '__other__' ? otherValue : selected;

    return (
        <div className={cn('flex flex-col gap-2', choiceFieldChrome)}>
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
                            onChange={(event) =>
                                setOtherValue(event.target.value)
                            }
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
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const stored = [
        ...selected,
        ...(allowOther && otherValue.trim() !== '' ? [otherValue.trim()] : []),
    ];

    const toggle = (value: string): void => {
        setSelected((current) =>
            current.includes(value)
                ? current.filter((v) => v !== value)
                : [...current, value],
        );
    };

    useEffect(() => {
        const handleClickOutside = (event: Event): void => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };

        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);

            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('touchstart', handleClickOutside);
            };
        }

        return () => {};
    }, [open]);

    return (
        <div className="space-y-2">
            <div ref={containerRef} className="relative">
                <button
                    type="button"
                    disabled={readonly}
                    onClick={() => setOpen(!open)}
                    className={cn(
                        inputLike,
                        'flex h-auto min-h-9 w-full items-center justify-between gap-2 text-left',
                    )}
                >
                    {selected.length === 0 ? (
                        <span className="text-muted-foreground">
                            Select options…
                        </span>
                    ) : (
                        <div className="flex flex-wrap gap-1">
                            {selected.map((value) => {
                                const option = options.find(
                                    (opt) => opt.value === value,
                                );

                                return (
                                    <span
                                        key={value}
                                        className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
                                    >
                                        {option?.label || value}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    <svg
                        className="size-4 shrink-0 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
                {open && !readonly && (
                    <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                        {options.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">
                                No options available.
                            </p>
                        ) : (
                            options.map((option) => {
                                const checked = selected.includes(option.value);

                                return (
                                    <div
                                        key={option.value}
                                        role="option"
                                        aria-selected={checked}
                                        tabIndex={0}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                                            checked && 'bg-accent/50',
                                        )}
                                        onClick={() => toggle(option.value)}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' ||
                                                event.key === ' '
                                            ) {
                                                event.preventDefault();
                                                toggle(option.value);
                                            }
                                        }}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            tabIndex={-1}
                                            className="pointer-events-none"
                                        />
                                        <span className="flex-1 truncate">
                                            {option.label || option.value}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
            {allowOther ? (
                <Input
                    value={otherValue}
                    readOnly={readonly}
                    placeholder="Additional custom value"
                    onChange={(event) => setOtherValue(event.target.value)}
                />
            ) : null}
            {stored.map((value) => (
                <input
                    key={value}
                    type="hidden"
                    name={`${name}[]`}
                    value={value}
                />
            ))}
        </div>
    );
}

function CheckboxGroupTreeNodes({
    nodes,
    depth,
    selectedValues,
    expandedKeys,
    onToggle,
    onToggleExpand,
    readonly,
}: {
    nodes: FieldTreeOptionRow[];
    depth: number;
    selectedValues: string[];
    expandedKeys: ReadonlySet<string>;
    onToggle: (value: string, checked: boolean) => void;
    onToggleExpand: (value: string) => void;
    readonly: boolean;
}) {
    return (
        <>
            {nodes.map((node) => {
                if (node.value.trim() === '' && node.label.trim() === '') {
                    return null;
                }

                const hasChildren = Boolean(node.children?.length);
                const expanded = hasChildren && expandedKeys.has(node.value);
                const checkState = getTreeNodeCheckState(node, selectedValues);

                return (
                    <Fragment key={`${depth}-${node.value}`}>
                        <div
                            className="flex items-center gap-1 text-sm"
                            style={{ paddingLeft: depth * 16 }}
                        >
                            {hasChildren ? (
                                <button
                                    type="button"
                                    className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                                    aria-expanded={expanded}
                                    aria-label={
                                        expanded ? 'Collapse' : 'Expand'
                                    }
                                    onClick={() => onToggleExpand(node.value)}
                                >
                                    {expanded ? (
                                        <ChevronDown className="size-3.5" />
                                    ) : (
                                        <ChevronRight className="size-3.5" />
                                    )}
                                </button>
                            ) : (
                                <span className="size-5 shrink-0" />
                            )}
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                <Checkbox
                                    checked={checkState}
                                    disabled={readonly}
                                    onCheckedChange={(next) =>
                                        onToggle(node.value, next === true)
                                    }
                                />
                                <span className="truncate">
                                    {node.label || node.value}
                                </span>
                            </label>
                        </div>
                        {hasChildren && expanded ? (
                            <CheckboxGroupTreeNodes
                                nodes={node.children!}
                                depth={depth + 1}
                                selectedValues={selectedValues}
                                expandedKeys={expandedKeys}
                                onToggle={onToggle}
                                onToggleExpand={onToggleExpand}
                                readonly={readonly}
                            />
                        ) : null}
                    </Fragment>
                );
            })}
        </>
    );
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
    const [expandedKeys, setExpandedKeys] = useState(
        () => new Set(collectExpandableKeys(treeOptions)),
    );

    const toggleValue = (optionValue: string, checked: boolean) => {
        setSelectedValues((current) =>
            cascadeToggleValues(treeOptions, current, optionValue, checked),
        );
    };

    const toggleExpand = (optionValue: string) => {
        setExpandedKeys((current) => {
            const next = new Set(current);

            if (next.has(optionValue)) {
                next.delete(optionValue);
            } else {
                next.add(optionValue);
            }

            return next;
        });
    };

    const storedValues =
        valueCombining === 'leaf'
            ? selectedValues.filter((value) =>
                  collectTreeLeafValues(treeOptions).includes(value),
              )
            : selectedValues;

    return (
        <div className={cn('flex flex-col gap-2', choiceFieldChrome)}>
            <CheckboxGroupTreeNodes
                nodes={treeOptions}
                depth={0}
                selectedValues={selectedValues}
                expandedKeys={expandedKeys}
                onToggle={toggleValue}
                onToggleExpand={toggleExpand}
                readonly={readonly}
            />
            {storedValues.map((value) => (
                <input
                    key={value}
                    type="hidden"
                    name={`${name}[]`}
                    value={value}
                />
            ))}
        </div>
    );
}
