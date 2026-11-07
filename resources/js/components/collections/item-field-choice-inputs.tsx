import { Check, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AutocompleteInput } from '@/components/collections/autocomplete-input';
import { LucideIconByName } from '@/components/collections/field-settings/lucide-icon-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
    cascadeToggleValues,
    collectExpandableKeys,
    collectTreeLeafValues,
    getTreeNodeCheckState,
} from '@/lib/checkbox-group-tree';
import {
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
import {
    fieldControlChromeMulti,
    fieldControlChromeSingle,
    fieldControlHeight,
    fieldFocusRing,
    fieldOpenBorder,
} from '@/lib/field-control-chrome';
import { cn } from '@/lib/utils';

/** Radix Select forbids empty string values — map allowNone ↔ sentinel. */
const SELECT_NONE_VALUE = '__none__';
const SELECT_OTHER_VALUE = '__other__';
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

export { toDatetimeLocalValue } from '@/lib/format';

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
/**
 * Field note under the control; the line is always reserved so half-width
 * siblings stay aligned.
 * @returns {JSX.Element}
 */
export function FieldNoteSlot({ note }: { note?: string }) {
    return (
        <FieldDescription className="min-h-5" aria-hidden={!note}>
            {note || '\u00A0'}
        </FieldDescription>
    );
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

    const addonClass = cn(
        'inline-flex w-9 shrink-0 items-center justify-center border border-input bg-muted/50 text-muted-foreground',
        fieldControlHeight,
    );

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
    // Boolean ("Toggle"): Switch + fixed affirmative label (not a Yes/No flip).
    const onLabel = resolveTranslatedText(
        booleanSettings.labelOn,
        locales,
        'Yes',
    );

    return (
        <label
            htmlFor={id}
            className={cn(
                fieldControlChromeSingle,
                'cursor-pointer gap-3',
                readonly && 'cursor-default bg-muted/50',
            )}
        >
            <Switch
                id={id}
                checked={checked}
                disabled={readonly}
                className={
                    readonly
                        ? 'disabled:cursor-default disabled:opacity-100'
                        : undefined
                }
                onCheckedChange={(next) => {
                    if (readonly) {
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

/**
 * Free-text input with suggestions from the field options (was `<datalist>`):
 * the typed text is submitted, the options only help to fill it.
 * @returns {JSX.Element}
 */
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
    const stringSettings = parseStringFieldSettings(settings);
    const options = parseFieldOptions(settings).filter(
        (option) => option.value.trim() !== '',
    );
    const placeholder = getFieldPlaceholder(settings, locales);
    const [text, setText] = useState(defaultValue);
    const normalizedText = text.trim().toLowerCase();
    const suggestions = options
        .filter(
            (option) =>
                option.value !== text &&
                (option.value.toLowerCase().includes(normalizedText) ||
                    option.label.toLowerCase().includes(normalizedText)),
        )
        .map((option) => ({
            value: option.value,
            label: option.label || option.value,
        }));

    return (
        <AutocompleteInput
            id={id}
            name={name}
            value={text}
            placeholder={placeholder}
            readOnly={readonly}
            suggestions={suggestions}
            onChange={(event) => setText(event.target.value)}
            onSelectSuggestion={(suggestion) => setText(suggestion.value)}
            renderInput={(input) => (
                <InputWithIcons
                    iconLeft={stringSettings.iconLeft}
                    iconRight={stringSettings.iconRight}
                >
                    {input}
                </InputWithIcons>
            )}
        />
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

    return (
        <div className="space-y-1">
            <AutocompleteInput
                id={id}
                name={name}
                value={query}
                placeholder={placeholder}
                readOnly={readonly}
                open={open}
                onOpenChange={setOpen}
                suggestions={suggestions.map((suggestion) => ({
                    value: suggestion.value,
                    label: suggestion.text,
                }))}
                onChange={(event) => {
                    committedSelectionRef.current = null;
                    setQuery(event.target.value);
                }}
                onSelectSuggestion={(suggestion) => {
                    committedSelectionRef.current = suggestion.value;
                    setQuery(suggestion.value);
                    setSuggestions([]);
                }}
                renderInput={(input) => (
                    <InputWithIcons iconLeft={iconLeft} iconRight={iconRight}>
                        {input}
                    </InputWithIcons>
                )}
            />
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
        <div className={cn(fieldControlChromeSingle, 'gap-2')}>
            {sliderSettings.showValue ? (
                <span
                    className="inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-sm bg-muted px-2 font-mono text-xs text-foreground tabular-nums"
                    aria-live="polite"
                >
                    {value}
                </span>
            ) : null}
            <Slider
                className="w-auto min-w-0 flex-1"
                min={sliderSettings.min}
                max={sliderSettings.max}
                step={sliderSettings.step}
                value={[value]}
                disabled={readonly}
                onValueChange={(next) =>
                    setValue(next[0] ?? sliderSettings.min)
                }
            />
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
        <div className={cn('flex flex-col gap-2', fieldControlChromeMulti)}>
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
                            aria-label="Other"
                        />
                        <span>Other</span>
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
    const radioIdPrefix = useId();

    return (
        <div className={cn('flex flex-col gap-2', fieldControlChromeMulti)}>
            <RadioGroup
                value={selected}
                onValueChange={(next) => {
                    if (!readonly) {
                        setSelected(next);
                    }
                }}
                disabled={readonly}
                className="gap-2"
            >
                {options.map((option) => {
                    const optionId = `${radioIdPrefix}-${option.value}`;

                    return (
                        <div
                            key={option.value}
                            className="flex items-center gap-2 text-sm"
                        >
                            <RadioGroupItem
                                value={option.value}
                                id={optionId}
                                disabled={readonly}
                            />
                            <Label htmlFor={optionId} className="font-normal">
                                {option.label || option.value}
                            </Label>
                        </div>
                    );
                })}
                {allowOther ? (
                    <div className="flex flex-col gap-2 text-sm">
                        <div className="flex items-center gap-2">
                            <RadioGroupItem
                                value="__other__"
                                id={`${radioIdPrefix}-__other__`}
                                disabled={readonly}
                            />
                            <Label
                                htmlFor={`${radioIdPrefix}-__other__`}
                                className="font-normal"
                            >
                                Other
                            </Label>
                        </div>
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
                    </div>
                ) : null}
            </RadioGroup>
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
    const { t } = useTranslation();
    const optionValues = options.map((option) => option.value);
    const initialOther = defaultValues.find(
        (value) => !optionValues.includes(value),
    );
    const [selected, setSelected] = useState(
        defaultValues.filter((value) => optionValues.includes(value)),
    );
    const [otherValue, setOtherValue] = useState(initialOther ?? '');
    const [open, setOpen] = useState(false);

    const stored = [
        ...selected,
        ...(allowOther && otherValue.trim() !== '' ? [otherValue.trim()] : []),
    ];

    const toggle = (value: string): void => {
        setSelected((current) =>
            current.includes(value)
                ? current.filter((selectedValue) => selectedValue !== value)
                : [...current, value],
        );
    };

    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={readonly}
                        className={cn(
                            'h-auto min-h-control w-full justify-between font-normal focus-visible:ring-offset-0',
                            fieldFocusRing,
                            fieldOpenBorder,
                        )}
                    >
                        <span className="flex flex-1 flex-wrap gap-1 text-left">
                            {selected.length === 0 ? (
                                <span className="text-muted-foreground">
                                    Select options…
                                </span>
                            ) : (
                                selected.map((value) => (
                                    <Badge
                                        key={value}
                                        variant="secondary"
                                        className="font-normal"
                                    >
                                        {options.find(
                                            (option) => option.value === value,
                                        )?.label || value}
                                    </Badge>
                                ))
                            )}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-0"
                    align="start"
                >
                    <Command>
                        <CommandInput
                            placeholder={t('picker.search')}
                            aria-label={t('a11y.search')}
                        />
                        <CommandList>
                            <CommandEmpty>
                                {options.length === 0
                                    ? 'No options available.'
                                    : t('picker.noResults')}
                            </CommandEmpty>
                            <CommandGroup>
                                {options.map((option) => {
                                    const isSelected = selected.includes(
                                        option.value,
                                    );

                                    return (
                                        <CommandItem
                                            key={option.value}
                                            value={option.value}
                                            keywords={[option.label]}
                                            data-checked={isSelected}
                                            onSelect={() =>
                                                toggle(option.value)
                                            }
                                        >
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input',
                                                    isSelected &&
                                                        'border-primary bg-primary text-primary-foreground',
                                                )}
                                            >
                                                {isSelected && (
                                                    <Check className="size-3.5 text-primary-foreground" />
                                                )}
                                            </span>
                                            <span className="flex-1 truncate">
                                                {option.label || option.value}
                                            </span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
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
        <div className={cn('flex flex-col gap-2', fieldControlChromeMulti)}>
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
