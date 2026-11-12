import { Copy, Languages } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLocaleFlag } from '@/components/collections/content-locale-flag';
import {
    applyLocaleValuesToAll,
    applyLocaleValuesToEmpty,
} from '@/components/collections/item-form/item-form-helpers';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { contentLocaleMeta } from '@/lib/content-locales-catalog';
import type { CollectionView } from '@/types/collections';

/**
 * Content locale picker of the item form. Each locale shows how many
 * translatable fields it fills; while editing, the menu can copy the current
 * locale's values to all other locales or only to the empty ones.
 */
export function ItemLocaleMenu({
    fields,
    locales,
    contentDefaults,
    globalLocale,
    onGlobalLocaleChange,
    formReadonly,
    onLocaleValuesApplied,
}: {
    fields: CollectionView['fields'] | undefined;
    locales: string[];
    contentDefaults: Record<string, unknown> | null | undefined;
    globalLocale: string;
    onGlobalLocaleChange: (locale: string) => void;
    formReadonly: boolean;
    /** Called after values were copied into other locales (marks the form dirty). */
    onLocaleValuesApplied: () => void;
}) {
    const { t } = useTranslation();

    const hasTranslatableFields = useMemo(
        () => (fields ?? []).some((field) => field.translatable),
        [fields],
    );

    const translationCompleteness = useMemo(() => {
        if (locales.length < 2 || !hasTranslatableFields) {
            return null;
        }

        const translatable = (fields ?? []).filter(
            (field) => field.translatable,
        );
        const scores: Record<string, { filled: number; total: number }> = {};

        for (const code of locales) {
            scores[code] = { filled: 0, total: translatable.length };
        }

        for (const field of translatable) {
            const bag = contentDefaults?.[field.name];

            if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
                continue;
            }

            const map = bag as Record<string, unknown>;

            for (const code of locales) {
                const value = map[code];
                const filled =
                    value !== null &&
                    value !== undefined &&
                    !(typeof value === 'string' && value.trim() === '');

                if (filled && scores[code]) {
                    scores[code].filled += 1;
                }
            }
        }

        return scores;
    }, [hasTranslatableFields, fields, contentDefaults, locales]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="px-3"
                    data-test="item-form-locale"
                    data-locale={globalLocale}
                >
                    <ContentLocaleFlag
                        region={contentLocaleMeta(globalLocale).flag}
                        title={contentLocaleMeta(globalLocale).name}
                        className="h-3.5 w-auto"
                    />
                    <span className="hidden font-mono text-xs uppercase lg:inline">
                        {globalLocale}
                    </span>
                    <Languages className="size-3.5 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
                {locales.map((code) => {
                    const meta = contentLocaleMeta(code);
                    const score = translationCompleteness?.[code];

                    return (
                        <DropdownMenuItem
                            key={code}
                            onClick={() => onGlobalLocaleChange(code)}
                            className="gap-2"
                        >
                            <ContentLocaleFlag region={meta.flag} />
                            <span className="flex-1">{meta.name}</span>
                            {score ? (
                                <span
                                    className="font-mono text-xs text-muted-foreground"
                                    data-test="translation-completeness"
                                >
                                    {score.filled}/{score.total}
                                </span>
                            ) : (
                                <span className="font-mono text-xs text-muted-foreground">
                                    {code}
                                </span>
                            )}
                        </DropdownMenuItem>
                    );
                })}
                {!formReadonly ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => {
                                if (
                                    applyLocaleValuesToAll(
                                        globalLocale,
                                        locales,
                                    )
                                ) {
                                    onLocaleValuesApplied();
                                }
                            }}
                            className="gap-2"
                        >
                            <Copy className="size-3.5" />
                            {t('collections.localized.applyAll')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                if (
                                    applyLocaleValuesToEmpty(
                                        globalLocale,
                                        locales,
                                    )
                                ) {
                                    onLocaleValuesApplied();
                                }
                            }}
                            className="gap-2"
                        >
                            <Copy className="size-3.5" />
                            {t('collections.localized.applyEmpty')}
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
