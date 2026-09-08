import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { STRING_LIMITS } from '@/lib/string-limits';
import { cn } from '@/lib/utils';

/** Shared Tailwind classes for filter select elements in page headers. */
export const filterSelectClassName =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 min-w-[10rem] rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none';

export type PageHeaderProps = {
    description?: ReactNode;
    subheader?: ReactNode;
    filters?: ReactNode;
    filtersRight?: ReactNode;
};

/**
 * Page description, subheader, and filter row used inside {@link PageLayout}.
 * @param {PageHeaderProps} props - Header section props.
 * @returns {JSX.Element}
 */
export function PageHeader({
    description,
    subheader,
    filters,
    filtersRight,
}: PageHeaderProps) {
    const showFilterRow = Boolean(filters || filtersRight);

    return (
        <div className="flex shrink-0 flex-col gap-3">
            {description ? (
                <p className="max-w-2xl text-sm text-muted-foreground">
                    {description}
                </p>
            ) : null}
            {subheader}
            {showFilterRow ? (
                <div className="flex flex-wrap items-center gap-3">
                    {filters ? (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            {filters}
                        </div>
                    ) : null}
                    {filtersRight ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {filtersRight}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export type FilterSearchProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    id?: string;
    maxLength?: number;
};

/**
 * Search input with icon for list and table filter toolbars.
 * @param {FilterSearchProps} props - Controlled search field props.
 * @returns {JSX.Element}
 */
export function FilterSearch({
    value,
    onChange,
    placeholder = 'Search…',
    className,
    id,
    maxLength = STRING_LIMITS.SEARCH,
}: FilterSearchProps) {
    return (
        <div
            className={cn(
                'relative min-w-[12rem] flex-1 sm:max-w-xs',
                className,
            )}
        >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                id={id}
                value={value}
                onChange={(changeEvent) => onChange(changeEvent.target.value)}
                placeholder={placeholder}
                maxLength={maxLength}
                className="h-9 pl-8"
            />
        </div>
    );
}
