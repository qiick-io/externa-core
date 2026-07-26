import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type DataTableToolbarProps = {
    search: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    selectedCount?: number;
    onClearSelection?: () => void;
    bulkActions?: ReactNode;
    trailing?: ReactNode;
    className?: string;
};

/**
 * Search and filter toolbar for admin data tables.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function DataTableToolbar({
    search,
    onSearchChange,
    searchPlaceholder = 'Search…',
    selectedCount = 0,
    onClearSelection,
    bulkActions,
    trailing,
    className,
}: DataTableToolbarProps) {
    const hasSelection = selectedCount > 0;

    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-between gap-3',
                className,
            )}
        >
            {hasSelection ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClearSelection}
                    >
                        <X className="mr-1 size-4" />
                        {selectedCount} selected
                    </Button>
                    {bulkActions}
                </div>
            ) : (
                <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="h-9 pl-8"
                    />
                </div>
            )}
            {!hasSelection && trailing && (
                <div className="flex flex-wrap items-center gap-2">
                    {trailing}
                </div>
            )}
        </div>
    );
}
