import { Link, router } from '@inertiajs/react';
import { GripVertical, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import ItemTrashController from '@/actions/App/Http/Controllers/Collections/ItemTrashController';
import { checkboxTargetClassName } from '@/components/admin/data-table';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import { TablePanel } from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { seedItemPrompt } from '@/lib/ai-open';
import type { CollectionFieldRow, CollectionView, ItemRow } from '@/types';
import { alignClass, ColumnHeaderMenu } from './column-header-menu';
import type { ColumnAlign } from './column-header-menu';
import { ColumnPickerPopover } from './column-picker-popover';
import type { RelatedFieldEntry } from './column-picker-popover';
import { columnHeaderLabel, ItemTableCell } from './item-table-cell';
import { itemLabel } from './items-index-helpers';
import type { Paginator } from './items-index-helpers';

type SortableHeaderProps = {
    id: string;
    label: string;
    sortActive: boolean;
    sortDirection?: 'asc' | 'desc';
    align: ColumnAlign;
    canHide: boolean;
    onSort: (direction: 'asc' | 'desc') => void;
    onAlign: (align: ColumnAlign) => void;
    onHide: () => void;
};

function SortableHeader({
    id,
    label,
    sortActive,
    sortDirection,
    align,
    canHide,
    onSort,
    onAlign,
    onHide,
}: SortableHeaderProps) {
    const { t } = useTranslation();

    return (
        <TableHead
            data-id={id}
            data-sortable-column=""
            className={alignClass(align)}
        >
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    className="drag-handle cursor-grab touch-none text-muted-foreground hover:text-foreground"
                    aria-label={t('collections.reorderColumn', { label })}
                >
                    <GripVertical className="size-3.5" />
                </button>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <ColumnHeaderMenu
                    label={label}
                    sortActive={sortActive}
                    sortDirection={sortDirection}
                    align={align}
                    canHide={canHide}
                    onSort={onSort}
                    onAlign={onAlign}
                    onHide={onHide}
                />
            </div>
        </TableHead>
    );
}

type ItemsTableProps = {
    collection: CollectionView;
    items: Paginator<ItemRow>;
    headerRowRef: RefObject<HTMLTableRowElement | null>;
    listColumns: string[];
    columnAligns: Record<string, ColumnAlign>;
    fieldsByName: Record<string, CollectionFieldRow>;
    relatedFieldsCatalog: Record<string, RelatedFieldEntry[]>;
    activeSort: string;
    activeDirection: 'asc' | 'desc';
    canHideColumn: boolean;
    hasSelection: boolean;
    selected: number[];
    isTrashed: boolean;
    versioningEnabled: boolean;
    approvalsRequired: boolean;
    toggleAll: (checked: boolean) => void;
    toggleRow: (id: number) => void;
    itemEditUrl: (itemId: number) => string;
    onSort: (path: string, direction: 'asc' | 'desc') => void;
    persistPrefs: (
        columns: string[],
        aligns: Record<string, ColumnAlign>,
    ) => void;
    persistColumns: (columns: string[]) => void;
    setDeleteItemId: (itemId: number) => void;
    setPendingForceDeleteItemId: (itemId: number) => void;
};

/**
 * Table layout of a collection's items: sortable, reorderable and hideable
 * column headers, the row checkboxes, draft / approval / schedule badges and
 * the per-row edit, restore and delete actions. Rows open the item on click,
 * Enter or Space (outside the trash).
 */
export function ItemsTable({
    collection,
    items,
    headerRowRef,
    listColumns,
    columnAligns,
    fieldsByName,
    relatedFieldsCatalog,
    activeSort,
    activeDirection,
    canHideColumn,
    hasSelection,
    selected,
    isTrashed,
    versioningEnabled,
    approvalsRequired,
    toggleAll,
    toggleRow,
    itemEditUrl,
    onSort,
    persistPrefs,
    persistColumns,
    setDeleteItemId,
    setPendingForceDeleteItemId,
}: ItemsTableProps) {
    const { t } = useTranslation();
    const { can } = useCan();

    return (
        <TablePanel>
            <Table>
                <TableHeader>
                    <TableRow ref={headerRowRef}>
                        <TableHead className="w-10">
                            <Checkbox
                                checked={
                                    items.data.length > 0 &&
                                    selected.length === items.data.length
                                }
                                onCheckedChange={(c) => toggleAll(c === true)}
                                aria-label={t('a11y.selectAll')}
                                className={checkboxTargetClassName}
                            />
                        </TableHead>
                        {listColumns.map((path) => (
                            <SortableHeader
                                key={path}
                                id={path}
                                label={columnHeaderLabel(
                                    path,
                                    fieldsByName,
                                    relatedFieldsCatalog,
                                )}
                                sortActive={activeSort === path}
                                sortDirection={
                                    activeSort === path
                                        ? activeDirection
                                        : undefined
                                }
                                align={columnAligns[path] ?? 'left'}
                                canHide={canHideColumn && !hasSelection}
                                onSort={(direction) => onSort(path, direction)}
                                onAlign={(align) =>
                                    persistPrefs(listColumns, {
                                        ...columnAligns,
                                        [path]: align,
                                    })
                                }
                                onHide={() => {
                                    if (!canHideColumn || hasSelection) {
                                        return;
                                    }

                                    persistColumns(
                                        listColumns.filter(
                                            (column) => column !== path,
                                        ),
                                    );
                                }}
                            />
                        ))}
                        <TableHead className="w-[1%] text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                                {!hasSelection ? (
                                    <ColumnPickerPopover
                                        fields={collection.fields ?? []}
                                        listColumns={listColumns}
                                        relatedFieldsCatalog={
                                            relatedFieldsCatalog
                                        }
                                        onChange={persistColumns}
                                    />
                                ) : null}
                                <span>
                                    {t('collections.columnPicker.actions')}
                                </span>
                            </div>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:h-10">
                    {items.data.map((row) => {
                        const editUrl = itemEditUrl(row.id);

                        return (
                            <TableRow
                                key={row.id}
                                className={
                                    isTrashed ? undefined : 'cursor-pointer'
                                }
                                tabIndex={isTrashed ? undefined : 0}
                                role={isTrashed ? undefined : 'link'}
                                onClick={() => {
                                    if (!isTrashed) {
                                        router.visit(editUrl);
                                    }
                                }}
                                onKeyDown={(event) => {
                                    if (isTrashed) {
                                        return;
                                    }

                                    if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                    ) {
                                        event.preventDefault();
                                        router.visit(editUrl);
                                    }
                                }}
                            >
                                <TableCell
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <Checkbox
                                        checked={selected.includes(row.id)}
                                        onCheckedChange={() =>
                                            toggleRow(row.id)
                                        }
                                        aria-label={t(
                                            'collections.items.selectItem',
                                            {
                                                id: row.id,
                                            },
                                        )}
                                        className={checkboxTargetClassName}
                                    />
                                </TableCell>
                                {listColumns.map((path) => (
                                    <TableCell
                                        key={path}
                                        className={alignClass(
                                            columnAligns[path] ?? 'left',
                                        )}
                                    >
                                        <ItemTableCell
                                            path={path}
                                            row={row}
                                            fieldsByName={fieldsByName}
                                        />
                                    </TableCell>
                                ))}
                                <TableCell className="w-[1%] text-right whitespace-nowrap">
                                    <div
                                        className="flex items-center justify-end gap-1"
                                        onPointerDown={(event) =>
                                            event.stopPropagation()
                                        }
                                    >
                                        {versioningEnabled && row.has_draft ? (
                                            <Badge
                                                variant="secondary"
                                                className="mr-1 text-xs"
                                                data-test={`item-draft-badge-${row.id}`}
                                            >
                                                {t(
                                                    'collections.itemToolbar.draft',
                                                )}
                                            </Badge>
                                        ) : null}
                                        {approvalsRequired &&
                                        row.approval_status &&
                                        row.approval_status !== 'draft' ? (
                                            <Badge
                                                variant={
                                                    row.approval_status ===
                                                    'rejected'
                                                        ? 'destructive'
                                                        : 'outline'
                                                }
                                                className="mr-1 text-xs"
                                                data-test={`item-approval-badge-${row.id}`}
                                            >
                                                {row.approval_status ===
                                                'in_review'
                                                    ? t(
                                                          'collections.itemToolbar.inReview',
                                                      )
                                                    : row.approval_status ===
                                                        'approved'
                                                      ? t(
                                                            'collections.itemToolbar.approved',
                                                        )
                                                      : t(
                                                            'collections.itemToolbar.rejected',
                                                        )}
                                            </Badge>
                                        ) : null}
                                        {versioningEnabled &&
                                        row.schedule_failed ? (
                                            <Badge
                                                variant="destructive"
                                                className="mr-1 text-xs"
                                                data-test={`item-schedule-failed-badge-${row.id}`}
                                            >
                                                {t(
                                                    'collections.itemSchedule.failedBadge',
                                                )}
                                            </Badge>
                                        ) : null}
                                        <AskAiButton
                                            stopPropagation
                                            prompt={seedItemPrompt({
                                                id: row.id,
                                                collection_id: collection.id,
                                                label: itemLabel(row),
                                            })}
                                        />
                                        {isTrashed ? (
                                            <>
                                                {can(
                                                    PermissionEnum.CanRestoreCollections,
                                                ) && (
                                                    <HeaderIconButton
                                                        type="button"
                                                        variant="outline"
                                                        size="icon-sm"
                                                        label={t(
                                                            'common.restore',
                                                        )}
                                                        onClick={() =>
                                                            router.post(
                                                                ItemTrashController.restore.url(
                                                                    {
                                                                        collection:
                                                                            collection.id,
                                                                        item: row.id,
                                                                    },
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        <RotateCcw className="size-3.5" />
                                                    </HeaderIconButton>
                                                )}
                                                {can(
                                                    PermissionEnum.CanForceDeleteCollections,
                                                ) && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            asChild
                                                        >
                                                            <HeaderIconButton
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                label={t(
                                                                    'a11y.moreActions',
                                                                )}
                                                                data-test={`item-row-menu-${row.id}`}
                                                            >
                                                                <MoreHorizontal className="size-3.5" />
                                                            </HeaderIconButton>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onSelect={() =>
                                                                    setPendingForceDeleteItemId(
                                                                        row.id,
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'common.deletePermanently',
                                                                )}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <HeaderIconButton
                                                    variant="outline"
                                                    size="icon-sm"
                                                    label={t(
                                                        'collections.collectionPages.edit',
                                                    )}
                                                    asChild
                                                    data-test={`item-row-edit-${row.id}`}
                                                >
                                                    <Link
                                                        href={editUrl}
                                                        onClick={(event) =>
                                                            event.stopPropagation()
                                                        }
                                                    >
                                                        <Pencil className="size-3.5" />
                                                    </Link>
                                                </HeaderIconButton>
                                                {can(
                                                    PermissionEnum.CanDeleteCollections,
                                                ) && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            asChild
                                                        >
                                                            <HeaderIconButton
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                label={t(
                                                                    'a11y.moreActions',
                                                                )}
                                                                data-test={`item-row-menu-${row.id}`}
                                                            >
                                                                <MoreHorizontal className="size-3.5" />
                                                            </HeaderIconButton>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                data-test={`item-row-delete-${row.id}`}
                                                                onSelect={() =>
                                                                    setDeleteItemId(
                                                                        row.id,
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'common.delete',
                                                                )}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TablePanel>
    );
}
