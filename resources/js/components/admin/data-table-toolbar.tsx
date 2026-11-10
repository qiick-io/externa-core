import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '@/components/ui/input-group';
import { STRING_LIMITS } from '@/lib/string-limits';
import { cn } from '@/lib/utils';

export type DataTableToolbarProps = {
    search: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    searchMaxLength?: number;
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
    searchMaxLength = STRING_LIMITS.SEARCH,
    selectedCount = 0,
    onClearSelection,
    bulkActions,
    trailing,
    className,
}: DataTableToolbarProps) {
    const { t } = useTranslation();
    const hasSelection = selectedCount > 0;

    return (
        <div
            className={cn(
                'flex min-w-0 flex-wrap items-center justify-between gap-2 sm:flex-nowrap',
                className,
            )}
        >
            {hasSelection ? (
                <>
                    <Button
                        type="button"
                        variant="ghost"
                        className="shrink-0"
                        onClick={onClearSelection}
                    >
                        <X className="size-4" aria-hidden="true" />
                        {t('common.selectedCount', { count: selectedCount })}
                    </Button>
                    {bulkActions ? (
                        <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
                            {bulkActions}
                        </div>
                    ) : null}
                </>
            ) : (
                <InputGroup className="min-w-[8rem] flex-1 basis-full sm:max-w-xs sm:basis-auto dark:bg-transparent">
                    <InputGroupInput
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder}
                        maxLength={searchMaxLength}
                    />
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                </InputGroup>
            )}
            {!hasSelection && trailing && (
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                    {trailing}
                </div>
            )}
        </div>
    );
}
