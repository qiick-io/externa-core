import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '@/components/ui/input-group';
import { STRING_LIMITS } from '@/lib/string-limits';
import { cn } from '@/lib/utils';

/** Shared Tailwind classes for filter select elements in page headers. */
export const filterSelectClassName =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-control min-w-[8rem] rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none';

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
        <div data-slot="page-header" className="flex shrink-0 flex-col gap-3">
            {description ? (
                <p className="max-w-2xl text-sm text-muted-foreground">
                    {description}
                </p>
            ) : null}
            {subheader}
            {/* -m-1 p-1: room for field focus halos inside the scrolling row. */}
            {showFilterRow ? (
                <div
                    data-slot="page-header-filters"
                    className="-m-1 flex min-w-0 flex-wrap items-center gap-3 p-1 sm:flex-nowrap sm:overflow-x-auto"
                >
                    {filters ? (
                        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:flex-nowrap">
                            {filters}
                        </div>
                    ) : null}
                    {filtersRight ? (
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
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
    /** `data-test` hook on the input for browser tests. */
    dataTest?: string;
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
    dataTest,
}: FilterSearchProps) {
    return (
        <InputGroup
            className={cn(
                'min-w-[8rem] flex-1 basis-full sm:max-w-xs sm:basis-auto dark:bg-transparent',
                className,
            )}
        >
            <InputGroupInput
                id={id}
                data-test={dataTest}
                value={value}
                onChange={(changeEvent) => onChange(changeEvent.target.value)}
                placeholder={placeholder}
                maxLength={maxLength}
            />
            <InputGroupAddon>
                <Search />
            </InputGroupAddon>
        </InputGroup>
    );
}
