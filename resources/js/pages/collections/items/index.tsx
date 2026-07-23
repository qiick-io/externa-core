import {
    closestCenter,
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Head, Link, router } from '@inertiajs/react';
import { GripVertical, Pencil, Plus, Rows3, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import {
    PageLayout,
    TablePagination,
    TablePanel,
} from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import collections from '@/routes/collections';
import type { BreadcrumbItem, CollectionFieldRow, CollectionView } from '@/types';
import {
    alignClass,
    ColumnHeaderMenu,
    type ColumnAlign,
} from './column-header-menu';
import {
    ColumnPickerPopover,
    type RelatedFieldEntry,
} from './column-picker-popover';
import { columnHeaderLabel, ItemTableCell } from './item-table-cell';

type ItemRow = {
    id: number;
    collection_id: number;
    data: Record<string, unknown>;
    created_at?: string | null;
    updated_at?: string | null;
    displays?: Record<string, string | null>;
    thumbs?: Record<string, string | null>;
};

type Paginator<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

type ItemsFilters = Record<string, string> & {
    title?: string;
    sort?: string;
    direction?: string;
};

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
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id });

    return (
        <TableHead
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(alignClass(align), isDragging && 'bg-muted opacity-80')}
        >
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
                    aria-label={`Reorder ${label}`}
                    {...attributes}
                    {...listeners}
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

/**
 * Paginated list of items in a collection with configurable columns.
 */
export default function ItemsIndex({
    collection,
    items,
    list_columns: listColumnsProp,
    column_aligns: columnAlignsProp = {},
    related_fields_catalog: relatedFieldsCatalog = {},
    filters,
}: {
    collection: CollectionView;
    items: Paginator<ItemRow>;
    list_columns: string[];
    column_aligns?: Record<string, ColumnAlign>;
    related_fields_catalog?: Record<string, RelatedFieldEntry[]>;
    filters: ItemsFilters;
}) {
    const [filterTitle, setFilterTitle] = useState(filters.title ?? '');
    const [listColumns, setListColumns] = useState(listColumnsProp);
    const [columnAligns, setColumnAligns] = useState(columnAlignsProp);
    const [deleteItemId, setDeleteItemId] = useState<number | null>(null);

    useEffect(() => {
        setListColumns(listColumnsProp);
    }, [listColumnsProp]);

    useEffect(() => {
        setColumnAligns(columnAlignsProp);
    }, [columnAlignsProp]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Collections', href: collections.index.url() },
            {
                title: collection.name,
                href: collections.items.index.url(collection.id),
            },
            { title: 'Items', href: collections.items.index.url(collection.id) },
        ],
        [collection.id, collection.name],
    );

    const fieldsByName = useMemo(() => {
        const map: Record<string, CollectionFieldRow> = {};
        for (const field of collection.fields ?? []) {
            map[field.name] = field;
        }

        return map;
    }, [collection.fields]);

    const persistPrefs = useCallback(
        (columns: string[], aligns: Record<string, ColumnAlign>) => {
            setListColumns(columns);
            setColumnAligns(aligns);
            router.put(
                ItemController.updateListColumns.url(collection.id),
                { columns, aligns },
                { preserveScroll: true, preserveState: true },
            );
        },
        [collection.id],
    );

    const persistColumns = useCallback(
        (columns: string[]) => {
            const nextAligns = Object.fromEntries(
                Object.entries(columnAligns).filter(([path]) =>
                    columns.includes(path),
                ),
            ) as Record<string, ColumnAlign>;
            persistPrefs(columns, nextAligns);
        },
        [columnAligns, persistPrefs],
    );

    const visit = useCallback(
        (overrides: {
            title?: string;
            sort?: string;
            direction?: 'asc' | 'desc';
        } = {}) => {
            const nextTitle =
                overrides.title !== undefined
                    ? overrides.title
                    : (filterTitle || undefined);
            const nextSort = overrides.sort ?? filters.sort ?? 'id';
            const nextDirection =
                overrides.direction ??
                (filters.direction === 'asc' ? 'asc' : 'desc');

            router.get(
                collections.items.index.url(collection.id),
                {
                    filter: {
                        title: nextTitle || undefined,
                    },
                    sort: nextSort,
                    direction: nextDirection,
                },
                { preserveState: true, preserveScroll: true },
            );
        },
        [collection.id, filterTitle, filters.direction, filters.sort],
    );

    useEffect(() => {
        if (filterTitle === (filters.title ?? '')) {
            return;
        }

        const timer = setTimeout(() => {
            visit({ title: filterTitle || undefined });
        }, 350);

        return () => clearTimeout(timer);
    }, [filterTitle, filters.title]); // eslint-disable-line react-hooks/exhaustive-deps

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const onDragEnd = (event: DragEndEvent): void => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = listColumns.indexOf(String(active.id));
        const newIndex = listColumns.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) {
            return;
        }

        persistColumns(arrayMove(listColumns, oldIndex, newIndex));
    };

    const collectionForm = useCollectionEditDrawer();
    const colSpan = listColumns.length + 1;
    const canHideColumn = listColumns.length > 1;
    const activeSort = filters.sort ?? 'id';
    const activeDirection =
        filters.direction === 'asc' ? 'asc' : ('desc' as const);

    const confirmDelete = (): void => {
        if (deleteItemId === null) {
            return;
        }

        router.delete(
            ItemController.destroy.url({
                collection: collection.id,
                item: deleteItemId,
            }),
            {
                preserveScroll: true,
                onSuccess: () => setDeleteItemId(null),
            },
        );
    };

    const itemEditUrl = (itemId: number): string =>
        collections.items.show.url({
            collection: collection.id,
            item: itemId,
        });

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <>
                    <CollectionEditButton
                        collectionForm={collectionForm}
                        collection={collection}
                    />
                    <Button variant="outline" asChild>
                        <Link href={FieldController.index.url(collection.id)}>
                            <Rows3 className="size-4" />
                            Edit fields
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href={collections.items.new.url(collection.id)}>
                            <Plus className="size-4" />
                            New item
                        </Link>
                    </Button>
                </>
            }
        >
            <Head title={`Items — ${collection.name}`} />

            <PageLayout
                filters={
                    <DataTableToolbar
                        search={filterTitle}
                        onSearchChange={setFilterTitle}
                        searchPlaceholder="Filter by title…"
                    />
                }
                footer={
                    items.last_page > 1 ? (
                        <TablePagination links={items.links} />
                    ) : undefined
                }
            >
                <TablePanel>
                    {/* ponytail: DndContext injects a11y <div>s — must stay outside <tr> or columns desync */}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={onDragEnd}
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableContext
                                        items={listColumns}
                                        strategy={horizontalListSortingStrategy}
                                    >
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
                                                align={
                                                    columnAligns[path] ?? 'left'
                                                }
                                                canHide={canHideColumn}
                                                onSort={(direction) =>
                                                    visit({
                                                        sort: path,
                                                        direction,
                                                    })
                                                }
                                                onAlign={(align) =>
                                                    persistPrefs(listColumns, {
                                                        ...columnAligns,
                                                        [path]: align,
                                                    })
                                                }
                                                onHide={() => {
                                                    if (!canHideColumn) {
                                                        return;
                                                    }

                                                    persistColumns(
                                                        listColumns.filter(
                                                            (column) =>
                                                                column !== path,
                                                        ),
                                                    );
                                                }}
                                            />
                                        ))}
                                    </SortableContext>
                                    <TableHead className="w-[1%] whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <ColumnPickerPopover
                                                fields={collection.fields ?? []}
                                                listColumns={listColumns}
                                                relatedFieldsCatalog={
                                                    relatedFieldsCatalog
                                                }
                                                onChange={persistColumns}
                                            />
                                            <span>Actions</span>
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={colSpan}
                                            className="text-muted-foreground"
                                        >
                                            No items yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    items.data.map((row) => {
                                        const editUrl = itemEditUrl(row.id);

                                        return (
                                            <TableRow
                                                key={row.id}
                                                className="cursor-pointer"
                                                tabIndex={0}
                                                role="link"
                                                aria-label={`Edit item ${row.id}`}
                                                onClick={() =>
                                                    router.visit(editUrl)
                                                }
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === 'Enter' ||
                                                        event.key === ' '
                                                    ) {
                                                        event.preventDefault();
                                                        router.visit(editUrl);
                                                    }
                                                }}
                                            >
                                                {listColumns.map((path) => (
                                                    <TableCell
                                                        key={path}
                                                        className={alignClass(
                                                            columnAligns[path] ??
                                                                'left',
                                                        )}
                                                    >
                                                        <ItemTableCell
                                                            path={path}
                                                            row={row}
                                                            fieldsByName={
                                                                fieldsByName
                                                            }
                                                        />
                                                    </TableCell>
                                                ))}
                                                <TableCell className="w-[1%] whitespace-nowrap text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            asChild
                                                        >
                                                            <Link
                                                                href={editUrl}
                                                                onClick={(
                                                                    event,
                                                                ) =>
                                                                    event.stopPropagation()
                                                                }
                                                            >
                                                                <Pencil className="size-3.5" />
                                                                Edit
                                                            </Link>
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={(
                                                                event,
                                                            ) => {
                                                                event.stopPropagation();
                                                                setDeleteItemId(
                                                                    row.id,
                                                                );
                                                            }}
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </DndContext>
                </TablePanel>
            </PageLayout>

            <Dialog
                open={deleteItemId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteItemId(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogTitle>Delete item?</DialogTitle>
                    <DialogDescription>
                        This item will be soft-deleted and removed from the
                        active list.
                    </DialogDescription>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmDelete}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <CollectionEditDrawer collectionForm={collectionForm} />
        </AppLayout>
    );
}
