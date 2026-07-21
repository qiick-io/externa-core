import { Copy, Languages } from 'lucide-react';
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
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    contentLocaleMeta,
    type ContentLocaleCatalogEntry,
} from '@/lib/content-locales-catalog';
import { cn } from '@/lib/utils';

export type LocalizedFieldProps = {
    locales: string[] | ContentLocaleCatalogEntry[];
    /** Controlled locale; omit to use ContentLocaleProvider / local state. */
    locale?: string;
    onLocaleChange?: (locale: string) => void;
    value?: Record<string, string>;
    onChange?: (value: Record<string, string>) => void;
    label?: string;
    description?: string;
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
};

function normalizeLocales(
    locales: string[] | ContentLocaleCatalogEntry[],
): ContentLocaleCatalogEntry[] {
    return locales.map((entry) =>
        typeof entry === 'string' ? contentLocaleMeta(entry) : entry,
    );
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
    placeholder,
    disabled = false,
    inputType = 'input',
    namePrefix,
    idPrefix,
    className,
    children,
    showCopyActions = true,
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

    const applyToAll = (): void => {
        const updated: Record<string, string> = { ...value };
        for (const code of localeCodes) {
            updated[code] = currentValue;
        }
        onChange?.(updated);
    };

    const applyToEmpty = (): void => {
        const updated: Record<string, string> = { ...value };
        for (const code of localeCodes) {
            if ((updated[code] ?? '').trim() === '') {
                updated[code] = currentValue;
            }
        }
        onChange?.(updated);
    };

    const activeMeta = contentLocaleMeta(locale);

    return (
        <div className={cn('space-y-2', className)}>
            {(label || showCopyActions) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                        {label ? <Label>{label}</Label> : null}
                        {description ? (
                            <p className="text-muted-foreground mt-1 text-sm">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    disabled={disabled || localeCodes.length === 0}
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
                            <DropdownMenuContent align="end" className="min-w-48">
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
                                        <span className="text-muted-foreground font-mono text-xs">
                                            {entry.code}
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                                {showCopyActions && onChange ? (
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
                    </div>
                </div>
            )}

            {namePrefix
                ? localeCodes.map((code) => (
                      <input
                          key={code}
                          type="hidden"
                          name={`${namePrefix}[${code}]`}
                          value={value[code] ?? ''}
                      />
                  ))
                : null}

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
                    disabled={disabled}
                />
            ) : (
                <Input
                    id={idPrefix ? `${idPrefix}_${locale}` : undefined}
                    value={currentValue}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                />
            )}
        </div>
    );
}
