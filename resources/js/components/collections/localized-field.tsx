import { Copy, Languages, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLocaleFlag } from '@/components/collections/content-locale-flag';
import { useContentLocale } from '@/components/collections/content-locale-provider';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { contentLocaleMeta } from '@/lib/content-locales-catalog';
import type { ContentLocaleCatalogEntry } from '@/lib/content-locales-catalog';
import { cn } from '@/lib/utils';

export type LocalizedFieldProps = {
    locales: string[] | ContentLocaleCatalogEntry[];
    /** Controlled locale; omit to use ContentLocaleProvider / local state. */
    locale?: string;
    onLocaleChange?: (locale: string) => void;
    value?: Partial<Record<string, string>>;
    onChange?: (value: Partial<Record<string, string>>) => void;
    label?: ReactNode;
    description?: string;
    /** Always render a one-line description slot below the control (even when empty) for row alignment. */
    reserveDescriptionSpace?: boolean;
    placeholder?: string;
    disabled?: boolean;
    inputType?: 'input' | 'textarea';
    namePrefix?: string;
    idPrefix?: string;
    className?: string;
    /** When set, replaces the built-in input (caller renders per active locale). */
    children?: (ctx: {
        locale: string;
        value: string;
        setValue: (next: string) => void;
    }) => ReactNode;
    showCopyActions?: boolean;
    /** Show per-source-locale AI translate actions when provided. */
    canTranslateWithAi?: boolean;
    onTranslateFromLocale?: (fromLocale: string) => void | Promise<void>;
    aiTranslating?: boolean;
    errorMessage?: string;
    /** Extra controls on the title row (right, beside locale) — e.g. markdown edit/preview. */
    headerActions?: ReactNode;
    /** Controls beside the label (left) — e.g. field value caret menu. */
    labelAddon?: ReactNode;
};

function normalizeLocales(
    locales: string[] | ContentLocaleCatalogEntry[],
): ContentLocaleCatalogEntry[] {
    return locales.map((entry) =>
        typeof entry === 'string' ? contentLocaleMeta(entry) : entry,
    );
}

function readNamedControl(
    name: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    const form = document.querySelector('form');

    if (!form) {
        return null;
    }

    return form.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(`[name="${name}"]`);
}

/**
 * Single-control multilingual field with locale switcher + flag (no gradients).
 */
export function LocalizedField({
    locales: localesProp,
    locale: localeProp,
    onLocaleChange,
    value = {},
    onChange,
    label,
    description,
    reserveDescriptionSpace = false,
    placeholder,
    disabled = false,
    inputType = 'input',
    namePrefix,
    idPrefix,
    className,
    children,
    showCopyActions = true,
    canTranslateWithAi = false,
    onTranslateFromLocale,
    aiTranslating = false,
    errorMessage,
    headerActions,
    labelAddon,
}: LocalizedFieldProps) {
    const { t } = useTranslation();
    const localeEntries = normalizeLocales(localesProp);
    const localeCodes = localeEntries.map((entry) => entry.code);
    const shared = useContentLocale(localeCodes);

    const locale =
        localeProp ??
        (localeCodes.includes(shared.locale)
            ? shared.locale
            : (localeCodes[0] ?? 'en'));

    const setLocale = (next: string): void => {
        onLocaleChange?.(next);

        if (localeProp === undefined) {
            shared.setLocale(next);
        }
    };

    const currentValue = value[locale] ?? '';

    const setValue = (next: string): void => {
        onChange?.({ ...value, [locale]: next });
    };

    const copyControlValue = (
        from: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
        to: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    ): void => {
        if ('readOnly' in to && to.readOnly) {
            return;
        }

        if (from.type === 'checkbox' || from.type === 'radio') {
            (to as HTMLInputElement).checked = (
                from as HTMLInputElement
            ).checked;
        } else {
            to.value = from.value;
        }

        to.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const copyFromLocale = (fromLocale: string): void => {
        if (fromLocale === locale) {
            return;
        }

        if (onChange) {
            onChange({ ...value, [locale]: value[fromLocale] ?? '' });

            return;
        }

        if (!namePrefix) {
            return;
        }

        const sourceInput = readNamedControl(`${namePrefix}[${fromLocale}]`);
        const targetInput = readNamedControl(`${namePrefix}[${locale}]`);

        if (!sourceInput || !targetInput) {
            return;
        }

        copyControlValue(sourceInput, targetInput);
    };

    const applyToAll = (): void => {
        if (onChange) {
            const updated: Partial<Record<string, string>> = { ...value };

            for (const code of localeCodes) {
                updated[code] = currentValue;
            }

            onChange(updated);
        } else if (namePrefix) {
            // ponytail: DOM manipulation fallback for uncontrolled forms
            const sourceInput = readNamedControl(`${namePrefix}[${locale}]`);

            if (!sourceInput) {
                return;
            }

            for (const code of localeCodes) {
                if (code === locale) {
                    continue;
                }

                const targetInput = readNamedControl(`${namePrefix}[${code}]`);

                if (targetInput) {
                    copyControlValue(sourceInput, targetInput);
                }
            }
        }
    };

    const applyToEmpty = (): void => {
        if (onChange) {
            const updated: Partial<Record<string, string>> = { ...value };

            for (const code of localeCodes) {
                if ((updated[code] ?? '').trim() === '') {
                    updated[code] = currentValue;
                }
            }

            onChange(updated);
        } else if (namePrefix) {
            // ponytail: DOM manipulation fallback for uncontrolled forms
            const sourceInput = readNamedControl(`${namePrefix}[${locale}]`);

            if (!sourceInput) {
                return;
            }

            for (const code of localeCodes) {
                if (code === locale) {
                    continue;
                }

                const targetInput = readNamedControl(`${namePrefix}[${code}]`);

                if (!targetInput) {
                    continue;
                }

                const isEmpty =
                    targetInput.type === 'checkbox' ||
                    targetInput.type === 'radio'
                        ? !(targetInput as HTMLInputElement).checked
                        : (targetInput.value ?? '').trim() === '';

                if (isEmpty) {
                    copyControlValue(sourceInput, targetInput);
                }
            }
        }
    };

    const activeMeta = contentLocaleMeta(locale);
    const otherLocales = localeEntries.filter((entry) => entry.code !== locale);

    const canCopy =
        showCopyActions && (Boolean(onChange) || Boolean(namePrefix));
    const showAi =
        canTranslateWithAi &&
        Boolean(onTranslateFromLocale) &&
        otherLocales.length > 0;

    return (
        <div className={cn('space-y-2', className)}>
            {/* min-h-8 matches Button/ToggleGroup sm so half-width siblings align with/without headerActions */}
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-0.5">
                    {label ? <Label>{label}</Label> : null}
                    {labelAddon}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {headerActions}
                    {localeCodes.length > 0 ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    disabled={disabled}
                                    data-test="localized-field-locale"
                                    data-locale={locale}
                                >
                                    <ContentLocaleFlag
                                        region={activeMeta.flag}
                                        title={activeMeta.name}
                                    />
                                    <span className="font-mono text-xs uppercase">
                                        {locale}
                                    </span>
                                    <Languages className="size-3.5 opacity-60" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="min-w-48"
                            >
                                {localeEntries.map((entry) => (
                                    <DropdownMenuItem
                                        key={entry.code}
                                        onClick={() => setLocale(entry.code)}
                                        className="gap-2"
                                    >
                                        <ContentLocaleFlag
                                            region={entry.flag}
                                        />
                                        <span className="flex-1">
                                            {entry.name}
                                        </span>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {entry.code}
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                                {canCopy && otherLocales.length > 0 ? (
                                    <>
                                        <DropdownMenuSeparator />
                                        {otherLocales.length >= 2 ? (
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger className="gap-2">
                                                    <Copy className="size-3.5" />
                                                    {t(
                                                        'collections.localized.copyFromMenu',
                                                    )}
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent className="min-w-40">
                                                    {otherLocales.map(
                                                        (entry) => (
                                                            <DropdownMenuItem
                                                                key={`copy-${entry.code}`}
                                                                onClick={() =>
                                                                    copyFromLocale(
                                                                        entry.code,
                                                                    )
                                                                }
                                                                className="gap-2"
                                                            >
                                                                <ContentLocaleFlag
                                                                    region={
                                                                        entry.flag
                                                                    }
                                                                />
                                                                <span className="flex-1">
                                                                    {entry.name}
                                                                </span>
                                                                <span className="font-mono text-xs text-muted-foreground">
                                                                    {entry.code}
                                                                </span>
                                                            </DropdownMenuItem>
                                                        ),
                                                    )}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        ) : (
                                            otherLocales.map((entry) => (
                                                <DropdownMenuItem
                                                    key={`copy-${entry.code}`}
                                                    onClick={() =>
                                                        copyFromLocale(
                                                            entry.code,
                                                        )
                                                    }
                                                    className="gap-2"
                                                >
                                                    <Copy className="size-3.5" />
                                                    {t(
                                                        'collections.localized.copyFrom',
                                                        {
                                                            locale: entry.name,
                                                        },
                                                    )}
                                                </DropdownMenuItem>
                                            ))
                                        )}
                                    </>
                                ) : null}
                                {showAi ? (
                                    <>
                                        <DropdownMenuSeparator />
                                        {otherLocales.length >= 2 ? (
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger
                                                    className="gap-2"
                                                    disabled={aiTranslating}
                                                >
                                                    <Sparkles className="size-3.5" />
                                                    {aiTranslating
                                                        ? t(
                                                              'collections.localized.translateWithAiBusy',
                                                          )
                                                        : t(
                                                              'collections.localized.translateWithAiFromMenu',
                                                          )}
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent className="min-w-40">
                                                    {otherLocales.map(
                                                        (entry) => (
                                                            <DropdownMenuItem
                                                                key={`ai-${entry.code}`}
                                                                disabled={
                                                                    aiTranslating
                                                                }
                                                                onClick={() => {
                                                                    void onTranslateFromLocale?.(
                                                                        entry.code,
                                                                    );
                                                                }}
                                                                className="gap-2"
                                                            >
                                                                <ContentLocaleFlag
                                                                    region={
                                                                        entry.flag
                                                                    }
                                                                />
                                                                <span className="flex-1">
                                                                    {entry.name}
                                                                </span>
                                                                <span className="font-mono text-xs text-muted-foreground">
                                                                    {entry.code}
                                                                </span>
                                                            </DropdownMenuItem>
                                                        ),
                                                    )}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        ) : (
                                            otherLocales.map((entry) => (
                                                <DropdownMenuItem
                                                    key={`ai-${entry.code}`}
                                                    disabled={aiTranslating}
                                                    onClick={() => {
                                                        void onTranslateFromLocale?.(
                                                            entry.code,
                                                        );
                                                    }}
                                                    className="gap-2"
                                                >
                                                    <Sparkles className="size-3.5" />
                                                    {aiTranslating
                                                        ? t(
                                                              'collections.localized.translateWithAiBusy',
                                                          )
                                                        : t(
                                                              'collections.localized.translateWithAiFrom',
                                                              {
                                                                  locale: entry.name,
                                                              },
                                                          )}
                                                </DropdownMenuItem>
                                            ))
                                        )}
                                    </>
                                ) : null}
                                {canCopy ? (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={applyToAll}
                                            className="gap-2"
                                        >
                                            <Copy className="size-3.5" />
                                            {t(
                                                'collections.localized.applyAll',
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={applyToEmpty}
                                            className="gap-2"
                                        >
                                            <Copy className="size-3.5" />
                                            {t(
                                                'collections.localized.applyEmpty',
                                            )}
                                        </DropdownMenuItem>
                                    </>
                                ) : null}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            </div>

            {/* ponytail: skip hidden mirrors when children own the real inputs */}
            {namePrefix && !children
                ? localeCodes.map((code) => (
                      <input
                          key={code}
                          type="hidden"
                          name={`${namePrefix}[${code}]`}
                          value={value[code] ?? ''}
                      />
                  ))
                : null}

            <div
                className={cn(aiTranslating && 'ai-field-translating')}
                aria-busy={aiTranslating || undefined}
                data-ai-translating={aiTranslating ? 'true' : undefined}
            >
                {children ? (
                    children({
                        locale,
                        value: currentValue,
                        setValue,
                    })
                ) : inputType === 'textarea' ? (
                    <Textarea
                        id={idPrefix ? `${idPrefix}_${locale}` : undefined}
                        value={currentValue}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={placeholder}
                        disabled={disabled || aiTranslating}
                        aria-invalid={!!errorMessage}
                    />
                ) : (
                    <Input
                        id={idPrefix ? `${idPrefix}_${locale}` : undefined}
                        value={currentValue}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={placeholder}
                        disabled={disabled || aiTranslating}
                        aria-invalid={!!errorMessage}
                    />
                )}
            </div>

            {reserveDescriptionSpace || description ? (
                <p
                    className="min-h-5 text-sm text-muted-foreground"
                    aria-hidden={!description}
                >
                    {description || '\u00A0'}
                </p>
            ) : null}

            {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
            )}
        </div>
    );
}
