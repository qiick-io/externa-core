import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Column header of the shadcn data-table pattern: a sortable column opens a
 * dropdown with ascending / descending; any other column renders its title.
 * With a server-driven {@link DataTable} the choice becomes a new server sort.
 *
 * @param props.column - TanStack column.
 * @param props.title - Visible header text.
 * @returns {JSX.Element}
 */
export function DataTableColumnHeader<TData, TValue>({
    column,
    title,
    className,
}: {
    column: Column<TData, TValue>;
    title: string;
    className?: string;
}) {
    const { t } = useTranslation();

    if (!column.getCanSort()) {
        return <div className={className}>{title}</div>;
    }

    const sortDirection = column.getIsSorted();

    return (
        <div className={cn('flex items-center', className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-sm data-[state=open]:bg-accent"
                        data-test={`column-sort-${column.id}`}
                    >
                        <span>{title}</span>
                        {sortDirection === 'desc' ? (
                            <ArrowDown aria-hidden="true" />
                        ) : sortDirection === 'asc' ? (
                            <ArrowUp aria-hidden="true" />
                        ) : (
                            <ChevronsUpDown aria-hidden="true" />
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuItem
                        onClick={() => column.toggleSorting(false)}
                    >
                        <ArrowUp aria-hidden="true" />
                        {t('common.sortAscending')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => column.toggleSorting(true)}
                    >
                        <ArrowDown aria-hidden="true" />
                        {t('common.sortDescending')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
