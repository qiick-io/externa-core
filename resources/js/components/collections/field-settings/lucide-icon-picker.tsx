import { Check, Search, X } from 'lucide-react';
import { DynamicIcon, dynamicIconImports } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import catalog from './lucide-icon-categories.json';

/** UI default when a collection has no stored icon (DB null stays null). */
export const DEFAULT_COLLECTION_ICON = 'Database';

type IconCategory = {
    id: string;
    label: string;
    icons: string[];
};

const ICON_CATEGORIES = catalog.categories as IconCategory[];

/**
 * Converts PascalCase Lucide component names to kebab-case DynamicIcon keys.
 * Keeps NxN patterns (e.g. Grid2x2 → grid-2x2) matching lucide-react 1.x.
 */
export function toLucideIconKebabName(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-zA-Z])(\d)/g, '$1-$2')
        .replace(/(\d)x-(\d)/gi, '$1x$2')
        .toLowerCase();
}

function isLucideIconName(name: string): name is IconName {
    return Object.hasOwn(dynamicIconImports, name);
}

/** Flat list kept for callers that still expect a curated options array. */
export const LUCIDE_ICON_OPTIONS: { name: string }[] = ICON_CATEGORIES.flatMap(
    (category) => category.icons.map((name) => ({ name })),
);

/**
 * Converts kebab-case Lucide names (e.g. flask-conical) to PascalCase component names.
 */
export function toLucideIconName(name: string): string {
    const trimmed = name.trim();

    if (!trimmed) {
        return '';
    }

    if (trimmed.includes('-') || trimmed.includes('_')) {
        return trimmed
            .split(/[-_]/)
            .filter(Boolean)
            .map(
                (part) =>
                    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
            )
            .join('');
    }

    const kebab = toLucideIconKebabName(trimmed);

    if (isLucideIconName(kebab)) {
        return trimmed;
    }

    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Resolves a stored icon name to a Lucide PascalCase key, falling back to the collection default.
 */
export function resolveCollectionIconName(name?: string | null): string {
    if (!name?.trim()) {
        return DEFAULT_COLLECTION_ICON;
    }

    const resolved = toLucideIconName(name);
    const kebab = toLucideIconKebabName(resolved);

    return isLucideIconName(kebab) ? resolved : DEFAULT_COLLECTION_ICON;
}

function resolveDynamicIconName(name: string): IconName | null {
    const kebab = toLucideIconKebabName(toLucideIconName(name));

    return isLucideIconName(kebab) ? kebab : null;
}

/**
 * Renders a Lucide icon by its string name (PascalCase or kebab-case).
 * Uses DynamicIcon so the full icons map is not pulled into the main chunk.
 */
export function LucideIconByName({
    name,
    className,
    style,
    fallbackToDefault = false,
}: {
    name: string;
    className?: string;
    style?: CSSProperties;
    fallbackToDefault?: boolean;
}) {
    const resolved = fallbackToDefault
        ? resolveCollectionIconName(name)
        : toLucideIconName(name);
    const iconName = resolveDynamicIconName(resolved);

    if (!iconName) {
        return null;
    }

    return <DynamicIcon name={iconName} className={className} style={style} />;
}

type LucideIconPickerProps = {
    id: string;
    label: string;
    value: string;
    onChange: (next: string) => void;
};

/**
 * Searchable, category-grouped Lucide icon picker (grid).
 */
export function LucideIconPicker({
    id,
    label,
    value,
    onChange,
}: LucideIconPickerProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedName = value ? toLucideIconName(value) : '';
    const previewName = resolveCollectionIconName(value);
    const previewIconName = resolveDynamicIconName(previewName);

    const filteredCategories = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
            return ICON_CATEGORIES;
        }

        return ICON_CATEGORIES.map((category) => ({
            ...category,
            icons: category.icons.filter((name) =>
                name.toLowerCase().includes(normalizedQuery),
            ),
        })).filter((category) => category.icons.length > 0);
    }, [query]);

    return (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Popover
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);

                    if (!next) {
                        setQuery('');
                    }
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        className="w-full justify-start gap-2"
                    >
                        {previewIconName ? (
                            <DynamicIcon
                                name={previewIconName}
                                className={cn(
                                    'size-4 shrink-0',
                                    !value && 'text-muted-foreground',
                                )}
                            />
                        ) : null}
                        <span
                            className={cn(
                                'truncate',
                                !value && 'text-muted-foreground',
                            )}
                        >
                            {selectedName || t('collections.meta.chooseIcon')}
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[22rem] p-0 sm:w-[26rem]"
                    align="start"
                >
                    <div className="border-b p-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={t('collections.meta.searchIcons')}
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                className="pr-8 pl-8"
                                // eslint-disable-next-line jsx-a11y/no-autofocus -- focus primary field when surface opens
                                autoFocus
                            />
                            {query ? (
                                <button
                                    type="button"
                                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                                    onClick={() => setQuery('')}
                                    aria-label={t(
                                        'collections.meta.clearIconSearch',
                                    )}
                                >
                                    <X className="size-4" />
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-3">
                        {filteredCategories.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                {t('collections.meta.noIconsFound')}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {filteredCategories.map((category) => (
                                    <div key={category.id}>
                                        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                            {category.label}
                                        </p>
                                        <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
                                            {category.icons.map((name) => {
                                                const iconName =
                                                    resolveDynamicIconName(
                                                        name,
                                                    );
                                                const selected =
                                                    selectedName === name;

                                                if (!iconName) {
                                                    return null;
                                                }

                                                return (
                                                    <button
                                                        key={name}
                                                        type="button"
                                                        title={name}
                                                        className={cn(
                                                            'flex size-8 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-muted',
                                                            selected &&
                                                                'border-primary bg-primary/10',
                                                        )}
                                                        onClick={() => {
                                                            onChange(name);
                                                            setOpen(false);
                                                            setQuery('');
                                                        }}
                                                    >
                                                        <DynamicIcon
                                                            name={iconName}
                                                            className="size-4"
                                                        />
                                                        {selected ? (
                                                            <Check className="sr-only" />
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {value ? (
                        <div className="border-t p-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full"
                                onClick={() => {
                                    onChange('');
                                    setOpen(false);
                                    setQuery('');
                                }}
                            >
                                {t('collections.meta.clearIcon')}
                            </Button>
                        </div>
                    ) : null}
                </PopoverContent>
            </Popover>
        </div>
    );
}
