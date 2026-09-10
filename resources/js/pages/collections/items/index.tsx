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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { createSortableList } from '@/lib/create-sortable-list';
import {
    emptyFilterRule,
    FILTER_META_KEYS,
    parseFiltersFromProps,
    serializeFilterRules,
} from '@/lib/item-list-filters';
import type { FilterRule } from '@/lib/item-list-filters';
import {
    currentPathWithQuery,
    withReturnParam,
} from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type {
    BreadcrumbItem,
    CollectionFieldRow,
    CollectionView,
} from '@/types';
import type { QueryParams } from '@/wayfinder';
import { alignClass, ColumnHeaderMenu } from './column-header-menu';
import type { ColumnAlign } from './column-header-menu';
import { ColumnPickerPopover } from './column-picker-popover';
import type { RelatedFieldEntry } from './column-picker-popover';
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
                    aria-label={`Reorder ${label}`}
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
    const [pendingBulkAction, setPendingBulkAction] = useState<
        'delete' | 'force_delete' | null
    >(null);
    const [pendingForceDeleteItemId, setPendingForceDeleteItemId] = useState<
        number | null
    >(null);
    const [confirmingDestructive, setConfirmingDestructive] = useState(false);
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
            {
                title: 'Items',
                href: collections.items.index.url(collection.id),
            },
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
        (
            overrides: {
                title?: string;
                rules?: FilterRule[];
                sort?: string;
                direction?: 'asc' | 'desc';
                trashed?: boolean;
            } = {},
        ) => {
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
                overrides.trashed !== undefined ? overrides.trashed : isTrashed;

            const filterPayload = serializeFilterRules(nextRules);

            // ponytail: put query on the Wayfinder URL (not router data) so cleared
            // filters are dropped instead of merged into the current search string.
            const query: QueryParams = {
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

    const headerRowRef = useRef<HTMLTableRowElement>(null);
    const listColumnsRef = useRef(listColumns);
    const persistColumnsRef = useRef(persistColumns);
    const listColumnsKey = listColumns.join('\0');

    useLayoutEffect(() => {
        listColumnsRef.current = listColumns;
        persistColumnsRef.current = persistColumns;
    });

    useEffect(() => {
        const el = headerRowRef.current;

        if (!el || listColumnsKey === '') {
            return;
        }

        // ponytail: Sortable on <tr>; only [data-sortable-column] th move (checkbox/actions stay put)
        const sortable = createSortableList(el, {
            handle: '.drag-handle',
            draggable: '[data-sortable-column]',
            direction: 'horizontal',
            onEnd: () => {
                const next = sortable.toArray();
                const prev = listColumnsRef.current;

                if (next.length === 0 || next.join('\0') === prev.join('\0')) {
                    return;
                }

                persistColumnsRef.current(next);
            },
        });

        return () => sortable.destroy();
    }, [listColumnsKey]);

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

        setConfirmingDestructive(true);
        router.delete(
            ItemController.destroy.url({
                collection: collection.id,
                item: deleteItemId,
            }),
            {
                preserveScroll: true,
                onFinish: () => setConfirmingDestructive(false),
                onSuccess: () => setDeleteItemId(null),
                onError: () => setDeleteItemId(null),
            },
        );
    };

    const listReturnUrl = (): string => currentPathWithQuery();

    const itemEditUrl = (itemId: number): string =>
        withReturnParam(
            collections.items.show.url({
                collection: collection.id,
                item: itemId,
            }),
            listReturnUrl(),
        );

    const itemNewUrl = (): string =>
        withReturnParam(
            collections.items.new.url(collection.id),
            listReturnUrl(),
        );

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
        params.set('direction', filters.direction === 'asc' ? 'asc' : 'desc');

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
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            aria-label="Export"
                                        >
                                            <Download className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Export</TooltipContent>
                            </Tooltip>
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
                        <HeaderIconButton asChild variant="outline" label="Edit fields">
                            <Link
                                href={FieldController.index.url(collection.id)}
                            >
                                <Rows3 className="size-4" />
                            </Link>
                        </HeaderIconButton>
                    ) : null}
                    {can(PermissionEnum.CanCreateCollections) ? (
                        <Button asChild>
                            <Link href={itemNewUrl()}>
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
                                            onClick={() =>
                                                setPendingBulkAction('delete')
                                            }
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
                                                setPendingBulkAction(
                                                    'force_delete',
                                                )
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
                    <Table>
                            <TableHeader>
                                <TableRow ref={headerRowRef}>
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
                                    <TableHead className="w-[1%] text-right whitespace-nowrap">
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
                                                            columnAligns[
                                                                path
                                                            ] ?? 'left',
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
                                                <TableCell className="w-[1%] text-right whitespace-nowrap">
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
                                                                    <HeaderIconButton
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="icon"
                                                                        className="size-8"
                                                                        label="Restore"
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
                                                                    </HeaderIconButton>
                                                                )}
                                                                {can(
                                                                    PermissionEnum.CanForceDeleteCollections,
                                                                ) && (
                                                                    <HeaderIconButton
                                                                        type="button"
                                                                        variant="destructive"
                                                                        size="icon"
                                                                        className="size-8"
                                                                        label="Delete permanently"
                                                                        onClick={() =>
                                                                            setPendingForceDeleteItemId(
                                                                                row.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </HeaderIconButton>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <HeaderIconButton
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="size-8"
                                                                    label="Edit"
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
                                                                    </Link>
                                                                </HeaderIconButton>
                                                                <HeaderIconButton
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="size-8 text-destructive hover:text-destructive"
                                                                    label="Delete"
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
                                                                </HeaderIconButton>
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
                </TablePanel>
            </PageLayout>

            <ConfirmDestructiveDialog
                open={deleteItemId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteItemId(null);
                    }
                }}
                title="Delete item?"
                description="This item will be soft-deleted and removed from the active list."
                confirming={confirmingDestructive}
                onConfirm={confirmDelete}
            />

            <ConfirmDestructiveDialog
                open={pendingBulkAction !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingBulkAction(null);
                    }
                }}
                title={
                    pendingBulkAction === 'force_delete'
                        ? `Delete ${selected.length} selected items permanently?`
                        : `Delete ${selected.length} selected items?`
                }
                description={
                    pendingBulkAction === 'force_delete'
                        ? 'Selected items will be permanently removed. This cannot be undone.'
                        : 'Selected items will be soft-deleted and moved to trash.'
                }
                confirmLabel={
                    pendingBulkAction === 'force_delete'
                        ? 'Delete permanently'
                        : 'Delete'
                }
                confirming={confirmingDestructive}
                onConfirm={() => {
                    if (pendingBulkAction === null) {
                        return;
                    }

                    setConfirmingDestructive(true);
                    router.post(
                        ItemController.bulk.url(collection.id),
                        { ids: selected, action: pendingBulkAction },
                        {
                            preserveScroll: true,
                            onFinish: () => setConfirmingDestructive(false),
                            onSuccess: () => {
                                setSelected([]);
                                setPendingBulkAction(null);
                            },
                            onError: () => setPendingBulkAction(null),
                        },
                    );
                }}
            />

            <ConfirmDestructiveDialog
                open={pendingForceDeleteItemId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingForceDeleteItemId(null);
                    }
                }}
                title="Delete item permanently?"
                description="This item will be permanently removed. This cannot be undone."
                confirmLabel="Delete permanently"
                confirming={confirmingDestructive}
                onConfirm={() => {
                    if (pendingForceDeleteItemId === null) {
                        return;
                    }

                    setConfirmingDestructive(true);
                    router.delete(
                        ItemController.forceDelete.url({
                            collection: collection.id,
                            item: pendingForceDeleteItemId,
                        }),
                        {
                            preserveScroll: true,
                            onFinish: () => setConfirmingDestructive(false),
                            onSuccess: () => setPendingForceDeleteItemId(null),
                            onError: () => setPendingForceDeleteItemId(null),
                        },
                    );
                }}
            />

            <CollectionEditDrawer collectionForm={collectionForm} />
        </AppLayout>
    );
}
