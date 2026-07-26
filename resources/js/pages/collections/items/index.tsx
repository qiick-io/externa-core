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
import {
    Download,
    FolderOpen,
    GripVertical,
    Pencil,
    Plus,
    RotateCcw,
    Rows3,
    Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { AskAiButton } from '@/components/ai/ask-ai-button';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import { seedItemPrompt, seedItemsBulkPrompt } from '@/lib/ai-open';
import {
    emptyFilterRule,
    FILTER_META_KEYS,
    parseFiltersFromProps,
    serializeFilterRules,
    type FilterRule,
} from '@/lib/item-list-filters';
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
import { ItemFiltersBuilder } from './item-filters-builder';
import { columnHeaderLabel, ItemTableCell } from './item-table-cell';

type ItemRow = {
    id: number;
    collection_id: number;
    data: Record<string, unknown>;
    created_at?: string | null;
    updated_at?: string | null;
    user_created?: { id: number; name: string; email?: string | null } | null;
    user_updated?: { id: number; name: string; email?: string | null } | null;
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

type ItemsFilters = Record<string, unknown> & {
    sort?: string;
    direction?: string;
    trashed?: boolean;
};

function titleContainsFromFilters(filters: ItemsFilters): string {
    const title = filters.title;
    if (typeof title === 'string') {
        return title;
    }
    if (title && typeof title === 'object' && !Array.isArray(title)) {
        const ops = title as Record<string, unknown>;
        if (typeof ops._contains === 'string') {
            return ops._contains;
        }
    }

    return '';
}

function itemLabel(row: ItemRow): string | null {
    const display = row.displays?.title;
    if (typeof display === 'string' && display.trim() !== '') {
        return display;
    }

    const title = row.data?.title;
    if (typeof title === 'string' && title.trim() !== '') {
        return title;
    }

    if (title && typeof title === 'object' && !Array.isArray(title)) {
        const first = Object.values(title as Record<string, unknown>).find(
            (value) => typeof value === 'string' && value.trim() !== '',
        );
        if (typeof first === 'string') {
            return first;
        }
    }

    return null;
}

/**
 * Hydrate advanced filter builder from URL/Inertia filters.
 * Title quick-search is mirrored into a title/_contains rule so the builder
 * can edit/clear the same filter the search box shows.
 */
function advancedRulesFromFilters(filters: ItemsFilters): FilterRule[] {
    const fieldFilters: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filters)) {
        if (FILTER_META_KEYS.has(key)) {
            continue;
        }
        fieldFilters[key] = value;
    }

    return parseFiltersFromProps(fieldFilters);
}

/** Keep search box and title/_contains rule in sync before navigating. */
function rulesWithTitleSearch(
    rules: FilterRule[],
    title: string,
): FilterRule[] {
    const withoutTitleContains = rules.filter(
        (rule) => !(rule.field === 'title' && rule.operator === '_contains'),
    );
    const trimmed = title.trim();
    if (trimmed === '') {
        return withoutTitleContains;
    }

    return [
        ...withoutTitleContains,
        { ...emptyFilterRule('title'), operator: '_contains', value: trimmed },
    ];
}

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
    const { can } = useCan();
    const isTrashed = filters.trashed === true;
    const [filterTitle, setFilterTitle] = useState(() =>
        titleContainsFromFilters(filters),
    );
    const [filterRules, setFilterRules] = useState<FilterRule[]>(() =>
        advancedRulesFromFilters(filters),
    );
    const [listColumns, setListColumns] = useState(listColumnsProp);
    const [columnAligns, setColumnAligns] = useState(columnAlignsProp);
    const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const hasSelection = selected.length > 0;

    useEffect(() => {
        setListColumns(listColumnsProp);
    }, [listColumnsProp]);

    useEffect(() => {
        setColumnAligns(columnAlignsProp);
    }, [columnAlignsProp]);

    useEffect(() => {
        setFilterTitle(titleContainsFromFilters(filters));
        setFilterRules(advancedRulesFromFilters(filters));
    }, [filters]);

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
            rules?: FilterRule[];
            sort?: string;
            direction?: 'asc' | 'desc';
            trashed?: boolean;
        } = {}) => {
            const nextRules =
                overrides.rules ??
                (overrides.title !== undefined
                    ? rulesWithTitleSearch(filterRules, overrides.title)
                    : filterRules);
            const nextSort = overrides.sort ?? filters.sort ?? 'id';
            const nextDirection =
                overrides.direction ??
                (filters.direction === 'asc' ? 'asc' : 'desc');
            const nextTrashed =
                overrides.trashed !== undefined
                    ? overrides.trashed
                    : isTrashed;

            const filterPayload = serializeFilterRules(nextRules);

            // ponytail: put query on the Wayfinder URL (not router data) so cleared
            // filters are dropped instead of merged into the current search string.
            const query: Record<string, unknown> = {
                sort: nextSort,
                direction: nextDirection,
            };
            if (Object.keys(filterPayload).length > 0) {
                query.filter = filterPayload;
            }
            if (nextTrashed) {
                query.trashed = true;
            }

            router.get(
                collections.items.index.url(collection.id, { query }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [
            collection.id,
            filterRules,
            filters.direction,
            filters.sort,
            isTrashed,
        ],
    );

    useEffect(() => {
        setSelected([]);
    }, [isTrashed, collection.id]);

    useEffect(() => {
        if (filterTitle === titleContainsFromFilters(filters)) {
            return;
        }

        const timer = setTimeout(() => {
            setFilterRules((current) => {
                const nextRules = rulesWithTitleSearch(current, filterTitle);
                visit({ rules: nextRules });

                return nextRules;
            });
        }, 350);

        return () => clearTimeout(timer);
    }, [filterTitle]); // eslint-disable-line react-hooks/exhaustive-deps

    const clearFilters = useCallback(() => {
        setFilterTitle('');
        setFilterRules([]);
        visit({ rules: [] });
    }, [visit]);

    const applyFilterRules = useCallback(() => {
        const titleContains = filterRules.find(
            (rule) => rule.field === 'title' && rule.operator === '_contains',
        );
        setFilterTitle(titleContains?.value ?? '');
        visit({ rules: filterRules });
    }, [filterRules, visit]);
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
    const colSpan = listColumns.length + 2;
    const canHideColumn = listColumns.length > 1;
    const activeSort = filters.sort ?? 'id';
    const activeDirection =
        filters.direction === 'asc' ? 'asc' : ('desc' as const);

    const toggleAll = (checked: boolean): void => {
        setSelected(checked ? items.data.map((row) => row.id) : []);
    };

    const toggleRow = (id: number): void => {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
        );
    };

    const bulk = (action: 'delete' | 'restore' | 'force_delete'): void => {
        router.post(
            ItemController.bulk.url(collection.id),
            { ids: selected, action },
            {
                preserveScroll: true,
                onSuccess: () => setSelected([]),
            },
        );
    };

    const selectedRows = items.data.filter((row) => selected.includes(row.id));

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

    const exportUrl = (format: 'csv' | 'json'): string => {
        const filterPayload = serializeFilterRules(filterRules);
        const trimmedTitle = filterTitle.trim();
        if (trimmedTitle !== '') {
            const titleBag = filterPayload.title ?? {};
            if (
                !('_eq' in titleBag) &&
                !('_neq' in titleBag) &&
                !('_in' in titleBag)
            ) {
                filterPayload.title = {
                    ...titleBag,
                    _contains: trimmedTitle,
                };
            }
        }

        const params = new URLSearchParams();
        params.set('format', format);
        params.set('sort', filters.sort ?? 'id');
        params.set(
            'direction',
            filters.direction === 'asc' ? 'asc' : 'desc',
        );

        for (const [field, ops] of Object.entries(filterPayload)) {
            if (ops && typeof ops === 'object') {
                for (const [op, value] of Object.entries(ops)) {
                    if (value === undefined || value === null) {
                        continue;
                    }
                    params.set(
                        `filter[${field}][${op}]`,
                        Array.isArray(value) ? value.join(',') : String(value),
                    );
                }
            }
        }

        return `${ItemController.exportMethod.url(collection.id)}?${params.toString()}`;
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <>
                    <CollectionEditButton
                        collectionForm={collectionForm}
                        collection={collection}
                    />
                    {can(PermissionEnum.CanShowCollections) ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline">
                                    <Download className="size-4" />
                                    Export
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <a href={exportUrl('csv')}>Export CSV</a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <a href={exportUrl('json')}>Export JSON</a>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                    {can(PermissionEnum.CanEditCollections) ? (
                        <Button variant="outline" asChild>
                            <Link
                                href={FieldController.index.url(collection.id)}
                            >
                                <Rows3 className="size-4" />
                                Edit fields
                            </Link>
                        </Button>
                    ) : null}
                    {can(PermissionEnum.CanCreateCollections) ? (
                        <Button asChild>
                            <Link
                                href={collections.items.new.url(collection.id)}
                            >
                                <Plus className="size-4" />
                                New item
                            </Link>
                        </Button>
                    ) : null}
                </>
            }
        >
            <Head title={`Items — ${collection.name}`} />

            <PageLayout
                filters={
                    <DataTableToolbar
                        search={filterTitle}
                        onSearchChange={setFilterTitle}
                        searchPlaceholder={
                            isTrashed ? 'Search trash…' : 'Search title…'
                        }
                        selectedCount={selected.length}
                        onClearSelection={() => setSelected([])}
                        bulkActions={
                            <>
                                <AskAiButton
                                    mode="labeled"
                                    prompt={seedItemsBulkPrompt(
                                        {
                                            id: collection.id,
                                            name: collection.name,
                                        },
                                        selectedRows.map((row) => ({
                                            id: row.id,
                                            label: itemLabel(row),
                                        })),
                                    )}
                                />
                                {!isTrashed &&
                                    can(
                                        PermissionEnum.CanDeleteCollections,
                                    ) && (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => bulk('delete')}
                                        >
                                            Delete
                                        </Button>
                                    )}
                                {isTrashed &&
                                    can(
                                        PermissionEnum.CanRestoreCollections,
                                    ) && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => bulk('restore')}
                                        >
                                            Restore
                                        </Button>
                                    )}
                                {isTrashed &&
                                    can(
                                        PermissionEnum.CanForceDeleteCollections,
                                    ) && (
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() =>
                                                bulk('force_delete')
                                            }
                                        >
                                            Delete permanently
                                        </Button>
                                    )}
                            </>
                        }
                        trailing={
                            <ItemFiltersBuilder
                                fields={collection.fields ?? []}
                                rules={filterRules}
                                onChange={setFilterRules}
                                onApply={applyFilterRules}
                                onClear={clearFilters}
                            />
                        }
                    />
                }
                filtersRight={
                    hasSelection ? null : (
                        <ToggleGroup
                            type="single"
                            value={isTrashed ? 'trashed' : 'active'}
                            onValueChange={(value) => {
                                if (!value) {
                                    return;
                                }

                                visit({ trashed: value === 'trashed' });
                            }}
                        >
                            <ToggleGroupItem
                                value="active"
                                aria-label="Active items"
                                className="px-2.5"
                            >
                                <FolderOpen className="size-4" />
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="trashed"
                                aria-label="Trash"
                                className="px-2.5"
                            >
                                <Trash2 className="size-4" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    )
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
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={
                                                items.data.length > 0 &&
                                                selected.length ===
                                                    items.data.length
                                            }
                                            onCheckedChange={(c) =>
                                                toggleAll(c === true)
                                            }
                                            aria-label="Select all"
                                        />
                                    </TableHead>
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
                                                canHide={
                                                    canHideColumn &&
                                                    !hasSelection
                                                }
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
                                                    if (
                                                        !canHideColumn ||
                                                        hasSelection
                                                    ) {
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
                                            {!hasSelection ? (
                                                <ColumnPickerPopover
                                                    fields={
                                                        collection.fields ?? []
                                                    }
                                                    listColumns={listColumns}
                                                    relatedFieldsCatalog={
                                                        relatedFieldsCatalog
                                                    }
                                                    onChange={persistColumns}
                                                />
                                            ) : null}
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
                                                className={
                                                    isTrashed
                                                        ? undefined
                                                        : 'cursor-pointer'
                                                }
                                                tabIndex={
                                                    isTrashed ? undefined : 0
                                                }
                                                role={
                                                    isTrashed
                                                        ? undefined
                                                        : 'link'
                                                }
                                                aria-label={
                                                    isTrashed
                                                        ? undefined
                                                        : `Edit item ${row.id}`
                                                }
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
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <Checkbox
                                                        checked={selected.includes(
                                                            row.id,
                                                        )}
                                                        onCheckedChange={() =>
                                                            toggleRow(row.id)
                                                        }
                                                        aria-label={`Select item ${row.id}`}
                                                    />
                                                </TableCell>
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
                                                    <div
                                                        className="flex items-center justify-end gap-1"
                                                        onClick={(event) =>
                                                            event.stopPropagation()
                                                        }
                                                    >
                                                        <AskAiButton
                                                            stopPropagation
                                                            prompt={seedItemPrompt(
                                                                {
                                                                    id: row.id,
                                                                    collection_id:
                                                                        collection.id,
                                                                    label: itemLabel(
                                                                        row,
                                                                    ),
                                                                },
                                                            )}
                                                        />
                                                        {isTrashed ? (
                                                            <>
                                                                {can(
                                                                    PermissionEnum.CanRestoreCollections,
                                                                ) && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            router.post(
                                                                                ItemController.restore.url(
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
                                                                        Restore
                                                                    </Button>
                                                                )}
                                                                {can(
                                                                    PermissionEnum.CanForceDeleteCollections,
                                                                ) && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            router.delete(
                                                                                ItemController.forceDelete.url(
                                                                                    {
                                                                                        collection:
                                                                                            collection.id,
                                                                                        item: row.id,
                                                                                    },
                                                                                ),
                                                                            )
                                                                        }
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                        Delete
                                                                        permanently
                                                                    </Button>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    asChild
                                                                >
                                                                    <Link
                                                                        href={
                                                                            editUrl
                                                                        }
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
                                                            </>
                                                        )}
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
