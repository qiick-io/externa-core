import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import type {
    ColumnDef,
    OnChangeFn,
    Row,
    RowData,
    RowSelectionState,
    SortingState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    TablePaginationFooter,
    TablePanel,
    hasTablePaginationFooter,
} from '@/components/layout/page-layout';
import type { TablePaginationState } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
    // Type parameters are required by the declaration merge.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ColumnMeta<TData extends RowData, TValue> {
        /** Classes for the column's `<th>`. */
        headerClassName?: string;
        /** Classes for each of the column's `<td>`. */
        cellClassName?: string;
        /** Clicks inside the cell do not reach `onRowClick` (checkboxes, row actions). */
        isRowClickIgnored?: boolean;
    }
}

/** Server sort state: the sorted column id and its direction. */
export type DataTableSort = {
    id: string;
    direction: 'asc' | 'desc';
};

export type DataTableProps<TData> = {
    /** Column definitions; a sortable column needs `accessorKey` / `accessorFn` and `enableSorting: true`, and its id is the server sort field. */
    columns: ColumnDef<TData, unknown>[];
    data: TData[];
    /** Stable row id (the record key); row selection is keyed by it. */
    getRowId: (row: TData) => string;
    /** Current server sort; omit for a list without column sorting. */
    sort?: DataTableSort;
    /** Called with the new sort when a column header asks for one. */
    onSortChange?: (sort: DataTableSort) => void;
    /** Controlled row selection (`{ [rowId]: true }`); omit to disable selection. */
    rowSelection?: RowSelectionState;
    onRowSelectionChange?: OnChangeFn<RowSelectionState>;
    /** Server paginator; renders the shared pagination footer when it is needed. */
    pagination?: TablePaginationState;
    /** Opens a row (edit drawer, detail page). */
    onRowClick?: (row: TData) => void;
    /** Extra props per `<tr>` (`data-test`, classes). */
    getRowProps?: (row: TData) => HTMLAttributes<HTMLTableRowElement> & {
        [dataAttribute: `data-${string}`]: string | undefined;
    };
    /** Details shown in a full-width row under an expanded row (see {@link dataTableExpandColumn}). */
    renderExpandedRow?: (row: TData) => ReactNode;
    /** Shown in the table body when `data` is empty. */
    emptyState?: ReactNode;
    className?: string;
};

/**
 * Server-driven data table: the shadcn data-table pattern on TanStack Table,
 * with sorting, pagination and filtering done by the server (`manual*`). The
 * page owns the query (Inertia visits, URL params, `per_page`); the table
 * renders the rows, reports header sort and selection changes, and puts the
 * shared pagination footer under the rows inside a `TablePanel`.
 *
 * Generic on purpose: no app types here, so it can become a registry item.
 *
 * @param props - See {@link DataTableProps}.
 * @returns {JSX.Element}
 */
export function DataTable<TData>({
    columns,
    data,
    getRowId,
    sort,
    onSortChange,
    rowSelection,
    onRowSelectionChange,
    pagination,
    onRowClick,
    getRowProps,
    renderExpandedRow,
    emptyState,
    className,
}: DataTableProps<TData>) {
    const { t } = useTranslation();
    const sorting: SortingState = sort
        ? [{ id: sort.id, desc: sort.direction === 'desc' }]
        : [];

    const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
        const nextSorting =
            typeof updater === 'function' ? updater(sorting) : updater;
        const [nextSort] = nextSorting;

        if (!nextSort || !onSortChange) {
            return;
        }

        onSortChange({
            id: nextSort.id,
            direction: nextSort.desc ? 'desc' : 'asc',
        });
    };

    // TanStack Table returns fresh functions every render, so the React
    // Compiler skips this component; that is the documented trade-off.
    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        getRowId,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
        manualFiltering: true,
        enableSortingRemoval: false,
        enableRowSelection: rowSelection !== undefined,
        getRowCanExpand: () => renderExpandedRow !== undefined,
        defaultColumn: { enableSorting: false },
        pageCount: pagination?.last_page ?? 1,
        state: {
            sorting,
            rowSelection: rowSelection ?? {},
        },
        onSortingChange: handleSortingChange,
        onRowSelectionChange,
    });

    const handleRowClick = (row: Row<TData>): void => {
        onRowClick?.(row.original);
    };

    return (
        <TablePanel
            className={className}
            footer={
                pagination && hasTablePaginationFooter(pagination) ? (
                    <TablePaginationFooter pagination={pagination} />
                ) : undefined
            }
        >
            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <TableHead
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    className={
                                        header.column.columnDef.meta
                                            ?.headerClassName
                                    }
                                >
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                              header.column.columnDef.header,
                                              header.getContext(),
                                          )}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows.length > 0 ? (
                        table.getRowModel().rows.map((row) => {
                            const rowProps = getRowProps?.(row.original);

                            return (
                                <Fragment key={row.id}>
                                    <TableRow
                                        data-state={
                                            row.getIsSelected()
                                                ? 'selected'
                                                : undefined
                                        }
                                        {...rowProps}
                                        className={cn(
                                            onRowClick && 'cursor-pointer',
                                            rowProps?.className,
                                        )}
                                        onClick={
                                            onRowClick
                                                ? () => handleRowClick(row)
                                                : undefined
                                        }
                                    >
                                        {row.getVisibleCells().map((cell) => {
                                            const meta =
                                                cell.column.columnDef.meta;

                                            return (
                                                <TableCell
                                                    key={cell.id}
                                                    className={
                                                        meta?.cellClassName
                                                    }
                                                    onClick={
                                                        meta?.isRowClickIgnored
                                                            ? (event) =>
                                                                  event.stopPropagation()
                                                            : undefined
                                                    }
                                                >
                                                    {flexRender(
                                                        cell.column.columnDef
                                                            .cell,
                                                        cell.getContext(),
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                    {row.getIsExpanded() &&
                                    renderExpandedRow ? (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell
                                                colSpan={
                                                    row.getVisibleCells().length
                                                }
                                            >
                                                {renderExpandedRow(
                                                    row.original,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </Fragment>
                            );
                        })
                    ) : (
                        <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={columns.length}>
                                {emptyState ?? (
                                    <Empty className="p-6 md:p-6">
                                        <EmptyHeader>
                                            <EmptyTitle className="text-sm font-normal text-muted-foreground">
                                                {t('common.noResults')}
                                            </EmptyTitle>
                                        </EmptyHeader>
                                    </Empty>
                                )}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TablePanel>
    );
}

/**
 * The selection column of the shadcn data-table pattern: a select-all
 * checkbox in the header and one checkbox per row. Clicks on it never open
 * the row.
 *
 * @param options.selectAllLabel - Accessible name of the header checkbox.
 * @param options.getRowLabel - Accessible name of a row checkbox.
 * @returns {ColumnDef<TData, unknown>}
 */
export function dataTableSelectColumn<TData>({
    selectAllLabel,
    getRowLabel,
}: {
    selectAllLabel: string;
    getRowLabel: (row: TData) => string;
}): ColumnDef<TData, unknown> {
    return {
        id: 'select',
        meta: { headerClassName: 'w-10', isRowClickIgnored: true },
        header: ({ table }) => (
            <Checkbox
                checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && 'indeterminate')
                }
                onCheckedChange={(checked) =>
                    table.toggleAllPageRowsSelected(checked === true)
                }
                aria-label={selectAllLabel}
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(checked) =>
                    row.toggleSelected(checked === true)
                }
                aria-label={getRowLabel(row.original)}
            />
        ),
    };
}

/**
 * Expand toggle column for a {@link DataTable} with `renderExpandedRow`.
 *
 * @param options.expandLabel - Accessible name while collapsed.
 * @param options.collapseLabel - Accessible name while expanded.
 * @returns {ColumnDef<TData, unknown>}
 */
export function dataTableExpandColumn<TData>({
    expandLabel,
    collapseLabel,
}: {
    expandLabel: string;
    collapseLabel: string;
}): ColumnDef<TData, unknown> {
    return {
        id: 'expand',
        meta: { headerClassName: 'w-8', isRowClickIgnored: true },
        header: () => null,
        cell: ({ row }) => {
            const isExpanded = row.getIsExpanded();

            return (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? collapseLabel : expandLabel}
                    onClick={row.getToggleExpandedHandler()}
                >
                    {isExpanded ? (
                        <ChevronDown aria-hidden="true" />
                    ) : (
                        <ChevronRight aria-hidden="true" />
                    )}
                </Button>
            );
        },
    };
}
