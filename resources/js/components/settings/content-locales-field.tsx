import { GripVertical, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLocaleFlag } from '@/components/collections/content-locale-flag';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { contentLocaleMeta } from '@/lib/content-locales-catalog';
import type { ContentLocaleCatalogEntry } from '@/lib/content-locales-catalog';
import { createSortableList } from '@/lib/create-sortable-list';

type Props = {
    catalog: ContentLocaleCatalogEntry[];
    value: string[];
    defaultLocale: string;
    onChange: (locales: string[], defaultLocale: string) => void;
};

function LocaleRow({
    code,
    onRemove,
    canRemove,
}: {
    code: string;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const meta = contentLocaleMeta(code);

    return (
        <div
            data-id={code}
            className="flex items-center gap-2 rounded-md border px-3 py-2"
        >
            <button
                type="button"
                className="drag-handle cursor-grab touch-none text-muted-foreground hover:text-foreground"
                aria-label="Reorder"
            >
                <GripVertical className="size-4" />
            </button>
            <ContentLocaleFlag region={meta.flag} title={meta.name} />
            <span className="flex-1 text-sm">
                <span className="font-medium">{meta.name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {code}
                </span>
            </span>
            <button
                type="button"
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={onRemove}
                disabled={!canRemove}
                aria-label={`Remove ${code}`}
            >
                <X className="size-4" />
            </button>
        </div>
    );
}

/**
 * Searchable multi-select + sortable list for project content locales.
 */
export function ContentLocalesField({
    catalog,
    value,
    defaultLocale,
    onChange,
}: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const listRef = useRef<HTMLDivElement>(null);
    const valueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const defaultLocaleRef = useRef(defaultLocale);

    useLayoutEffect(() => {
        valueRef.current = value;
        onChangeRef.current = onChange;
        defaultLocaleRef.current = defaultLocale;
    });

    const selected = new Set(value);
    const valueKey = value.join('\0');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();

        if (q === '') {
            return catalog;
        }

        return catalog.filter(
            (entry) =>
                entry.code.toLowerCase().includes(q) ||
                entry.name.toLowerCase().includes(q),
        );
    }, [catalog, query]);

    const setLocales = (next: string[]): void => {
        let nextDefault = defaultLocale;

        if (!next.includes(nextDefault)) {
            nextDefault = next[0] ?? '';
        }

        onChange(next, nextDefault);
    };

    const toggle = (code: string, enabled: boolean): void => {
        if (enabled) {
            if (selected.has(code)) {
                return;
            }

            setLocales([...value, code]);

            return;
        }

        if (value.length <= 1) {
            return;
        }

        setLocales(value.filter((entry) => entry !== code));
    };

    useEffect(() => {
        const el = listRef.current;

        if (!el || value.length === 0) {
            return;
        }

        const sortable = createSortableList(el, {
            handle: '.drag-handle',
            onEnd: () => {
                const next = sortable.toArray();
                const prev = valueRef.current;

                if (next.length === 0 || next.join('\0') === prev.join('\0')) {
                    return;
                }

                let nextDefault = defaultLocaleRef.current;

                if (!next.includes(nextDefault)) {
                    nextDefault = next[0] ?? '';
                }

                onChangeRef.current(next, nextDefault);
            },
        });

        return () => sortable.destroy();
    }, [value.length, valueKey]);

    return (
        <div className="space-y-4">
            <div className="grid gap-2">
                <Label htmlFor="content_locales_search">
                    {t('settings.project.contentLocalesAdd')}
                </Label>
                <div className="relative">
                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                    <Input
                        id="content_locales_search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('settings.project.contentLocalesSearch')}
                        className="pl-9"
                    />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                    {filtered.map((entry) => {
                        const checked = selected.has(entry.code);

                        return (
                            <label
                                key={entry.code}
                                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                            >
                                <Checkbox
                                    checked={checked}
                                    disabled={checked && value.length <= 1}
                                    onCheckedChange={(state) =>
                                        toggle(entry.code, state === true)
                                    }
                                />
                                <ContentLocaleFlag
                                    region={entry.flag}
                                    title={entry.name}
                                />
                                <span className="flex-1 text-sm">
                                    {entry.name}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {entry.code}
                                </span>
                            </label>
                        );
                    })}
                    {filtered.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-muted-foreground">
                            {t('settings.project.contentLocalesEmpty')}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="grid gap-2">
                <Label>{t('settings.project.contentLocalesSelected')}</Label>
                <div ref={listRef} className="space-y-2">
                    {value.map((code) => (
                        <LocaleRow
                            key={code}
                            code={code}
                            canRemove={value.length > 1}
                            onRemove={() => toggle(code, false)}
                        />
                    ))}
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="default_content_locale">
                    {t('settings.project.defaultContentLocale')}
                </Label>
                <Select
                    value={defaultLocale}
                    onValueChange={(next) => onChange(value, next)}
                >
                    <SelectTrigger
                        id="default_content_locale"
                        className="w-full"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {value.map((code) => {
                            const meta = contentLocaleMeta(code);

                            return (
                                <SelectItem key={code} value={code}>
                                    <span className="inline-flex items-center gap-2">
                                        <ContentLocaleFlag region={meta.flag} />
                                        {meta.name} ({code})
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
