import { Head, Link, router } from '@inertiajs/react';
import {
    CalendarDays,
    Columns3,
    Download,
    FolderOpen,
    GripVertical,
    LayoutList,
    MoreHorizontal,
    Pencil,
    Plus,
    RotateCcw,
    Rows3,
    SearchX,
    Trash2,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { checkboxTargetClassName } from '@/components/admin/data-table';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { EmptyStatus } from '@/components/empty-status';
import {
    PageLayout,
    hasTablePaginationFooter,
    TablePaginationFooter,
    TablePanel,
} from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useDebouncedServerSearch } from '@/hooks/use-debounced-server-search';
import AppLayout from '@/layouts/app-layout';
import { seedItemPrompt, seedItemsBulkPrompt } from '@/lib/ai-open';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import { createSortableList } from '@/lib/create-sortable-list';
import {
    emptyFilterRule,
    FILTER_META_KEYS,
    parseFiltersFromProps,
    serializeFilterRules,
} from '@/lib/item-list-filters';
import type { FilterRule } from '@/lib/item-list-filters';
import { listPerPageQuery } from '@/lib/pagination';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type {
    BreadcrumbItem,
    CollectionFieldRow,
    CollectionView,
    ItemRow,
} from '@/types';
import type { QueryParams } from '@/wayfinder';
import { alignClass, ColumnHeaderMenu } from './column-header-menu';
import type { ColumnAlign } from './column-header-menu';
import { ColumnPickerPopover } from './column-picker-popover';
import type { RelatedFieldEntry } from './column-picker-popover';
import { ItemFiltersBuilder } from './item-filters-builder';
import { columnHeaderLabel, ItemTableCell } from './item-table-cell';
import { ItemsCalendar } from './items-calendar';
import type { CalendarMonthPayload } from './items-calendar';
import { ItemsKanban } from './items-kanban';
import type { KanbanBoard } from './items-kanban';

type ListLayout = 'table' | 'kanban' | 'calendar';

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
    has_draft?: boolean;
    in_review?: boolean;
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

/**
 * Paginated list of items in a collection with configurable columns.
 */
export default function ItemsIndex({
    collection,
    items,
    list_columns: listColumnsProp,
    column_aligns: columnAlignsProp = {},
    list_layout: listLayoutProp = 'table',
    kanban_field: kanbanFieldProp = null,
    kanban: kanbanBoardProp = null,
    calendar_field: calendarFieldProp = null,
    calendar: calendarProp = null,
    related_fields_catalog: relatedFieldsCatalog = {},
    filters,
}: {
    collection: CollectionView;
    items: Paginator<ItemRow>;
    list_columns: string[];
    column_aligns?: Record<string, ColumnAlign>;
    list_layout?: ListLayout;
    kanban_field?: string | null;
    kanban?: KanbanBoard | null;
    calendar_field?: string | null;
    calendar?: CalendarMonthPayload | null;
    related_fields_catalog?: Record<string, RelatedFieldEntry[]>;
    filters: ItemsFilters;
}) {
    const { t } = useTranslation();
    const { can } = useCan();
    const isTrashed = filters.trashed === true;
    const versioningEnabled = Boolean(collection.versioning);
    const approvalsRequired = Boolean(collection.approvals_required);
    const hasDraftFilter = filters.has_draft === true;
    const inReviewFilter = filters.in_review === true;
    const [filterTitle, setFilterTitle] = useState(() =>
        titleContainsFromFilters(filters),
    );
    const [filterRules, setFilterRules] = useState<FilterRule[]>(() =>
        advancedRulesFromFilters(filters),
    );
    const [listColumns, setListColumns] = useState(listColumnsProp);
    const [columnAligns, setColumnAligns] = useState(columnAlignsProp);
    const [listLayout, setListLayout] = useState<ListLayout>(
        listLayoutProp === 'kanban' || listLayoutProp === 'calendar'
            ? listLayoutProp
            : 'table',
    );
    const [kanbanField, setKanbanField] = useState<string | null>(
        kanbanFieldProp,
    );
    const [calendarField, setCalendarField] = useState<string | null>(
        calendarFieldProp,
    );
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
    const hasActiveFilters =
        filterTitle.trim() !== '' ||
        filterRules.length > 0 ||
        hasDraftFilter ||
        inReviewFilter;
    const isListEmpty = items.data.length === 0;
    const hideListChrome =
        isListEmpty &&
        !hasActiveFilters &&
        !isTrashed &&
        listLayout === 'table';

    const [previousServerProps, setPreviousServerProps] = useState({
        listColumnsProp,
        columnAlignsProp,
        listLayoutProp,
        kanbanFieldProp,
        calendarFieldProp,
        filters,
    });

    // Adopt each server prop during render when Inertia sends a new value
    // (React's "adjust state on prop change" pattern); local edits survive
    // until then.
    if (
        previousServerProps.listColumnsProp !== listColumnsProp ||
        previousServerProps.columnAlignsProp !== columnAlignsProp ||
        previousServerProps.listLayoutProp !== listLayoutProp ||
        previousServerProps.kanbanFieldProp !== kanbanFieldProp ||
        previousServerProps.calendarFieldProp !== calendarFieldProp ||
        previousServerProps.filters !== filters
    ) {
        setPreviousServerProps({
            listColumnsProp,
            columnAlignsProp,
            listLayoutProp,
            kanbanFieldProp,
            calendarFieldProp,
            filters,
        });

        if (previousServerProps.listColumnsProp !== listColumnsProp) {
            setListColumns(listColumnsProp);
        }

        if (previousServerProps.columnAlignsProp !== columnAlignsProp) {
            setColumnAligns(columnAlignsProp);
        }

        if (previousServerProps.listLayoutProp !== listLayoutProp) {
            setListLayout(
                listLayoutProp === 'kanban' || listLayoutProp === 'calendar'
                    ? listLayoutProp
                    : 'table',
            );
        }

        if (previousServerProps.kanbanFieldProp !== kanbanFieldProp) {
            setKanbanField(kanbanFieldProp);
        }

        if (previousServerProps.calendarFieldProp !== calendarFieldProp) {
            setCalendarField(calendarFieldProp);
        }

        if (previousServerProps.filters !== filters) {
            setFilterTitle(titleContainsFromFilters(filters));
            setFilterRules(advancedRulesFromFilters(filters));
        }
    }

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: t('nav.collections'), href: collections.index.url() },
            {
                title: collection.name,
                href: collections.items.index.url(collection.id),
            },
            {
                title: t('nav.items'),
                href: collections.items.index.url(collection.id),
            },
        ],
        [collection.id, collection.name, t],
    );

    const fieldsByName = useMemo(() => {
        const map: Record<string, CollectionFieldRow> = {};

        for (const field of collection.fields ?? []) {
            map[field.name] = field;
        }

        return map;
    }, [collection.fields]);

    const kanbanFields = useMemo(
        () =>
            (collection.fields ?? []).filter(
                (field) =>
                    field.type === 'select' || field.type === 'radio_group',
            ),
        [collection.fields],
    );

    const calendarFields = useMemo(
        () =>
            (collection.fields ?? []).filter((field) => field.type === 'date'),
        [collection.fields],
    );

    const persistPrefs = useCallback(
        (
            columns: string[],
            aligns: Record<string, ColumnAlign>,
            extras?: {
                layout?: ListLayout;
                kanban_field?: string | null;
                calendar_field?: string | null;
            },
        ) => {
            setListColumns(columns);
            setColumnAligns(aligns);
            router.put(
                ItemController.updateListColumns.url(collection.id),
                {
                    columns,
                    aligns,
                    layout: extras?.layout ?? listLayout,
                    kanban_field:
                        extras && 'kanban_field' in extras
                            ? extras.kanban_field
                            : kanbanField,
                    calendar_field:
                        extras && 'calendar_field' in extras
                            ? extras.calendar_field
                            : calendarField,
                },
                { preserveScroll: true, preserveState: true },
            );
        },
        [calendarField, collection.id, kanbanField, listLayout],
    );

    const setLayout = useCallback(
        (layout: ListLayout) => {
            setListLayout(layout);
            persistPrefs(listColumns, columnAligns, { layout });
        },
        [columnAligns, listColumns, persistPrefs],
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
                has_draft?: boolean;
                in_review?: boolean;
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
            const nextHasDraft =
                overrides.has_draft !== undefined
                    ? overrides.has_draft
                    : hasDraftFilter;
            const nextInReview =
                overrides.in_review !== undefined
                    ? overrides.in_review
                    : inReviewFilter;

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

            if (nextHasDraft) {
                query.has_draft = true;
            }

            if (nextInReview) {
                query.in_review = true;
            }

            // Keep board/calendar across search/filter visits (prefs alone lag URL).
            if (listLayout === 'kanban' || listLayout === 'calendar') {
                query.layout = listLayout;
            }

            if (listLayout === 'kanban' && kanbanField) {
                query.kanban_field = kanbanField;
            }

            if (listLayout === 'calendar' && calendarField) {
                query.calendar_field = calendarField;
            }

            const perPage = listPerPageQuery(items.per_page);

            if (perPage !== undefined) {
                query.per_page = perPage;
            }

            router.get(
                collections.items.index.url(collection.id, { query }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [
            calendarField,
            collection.id,
            filterRules,
            filters.direction,
            filters.sort,
            hasDraftFilter,
            inReviewFilter,
            isTrashed,
            items.per_page,
            kanbanField,
            listLayout,
        ],
    );

    const [previousSelectionScope, setPreviousSelectionScope] = useState({
        isTrashed,
        collectionId: collection.id,
    });

    // Clear the selection during render when switching collection or trash view.
    if (
        previousSelectionScope.isTrashed !== isTrashed ||
        previousSelectionScope.collectionId !== collection.id
    ) {
        setPreviousSelectionScope({ isTrashed, collectionId: collection.id });
        setSelected([]);
    }

    const onDebouncedTitleSearch = useCallback(
        (value: string): void => {
            setFilterRules((current) => {
                const nextRules = rulesWithTitleSearch(current, value);
                visit({ rules: nextRules });

                return nextRules;
            });
        },
        [visit],
    );

    useDebouncedServerSearch(
        filterTitle,
        titleContainsFromFilters(filters),
        onDebouncedTitleSearch,
    );

    const clearFilters = useCallback(() => {
        setFilterTitle('');
        setFilterRules([]);
        visit({ rules: [], has_draft: false, in_review: false });
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
                                            aria-label={t('common.export')}
                                        >
                                            <Download className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('common.export')}
                                </TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <a href={exportUrl('csv')}>
                                        {t('activityLog.exportCsv')}
                                    </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <a href={exportUrl('json')}>
                                        {t('activityLog.exportJson')}
                                    </a>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                    {can(PermissionEnum.CanEditCollections) ? (
                        <HeaderIconButton
                            asChild
                            variant="outline"
                            label={t('collections.itemToolbar.editFields')}
                        >
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
                                {t('collections.items.list.newItem')}
                            </Link>
                        </Button>
                    ) : null}
                </>
            }
        >
            <Head
                title={t('collections.items.pageTitle', {
                    collection: collection.name,
                })}
            />

            <PageLayout
                filters={
                    hideListChrome ? undefined : (
                        <DataTableToolbar
                            search={filterTitle}
                            onSearchChange={setFilterTitle}
                            searchPlaceholder={
                                isTrashed
                                    ? t('collections.itemsList.searchTrash')
                                    : t('collections.itemsList.searchTitle')
                            }
                            selectedCount={selected.length}
                            onClearSelection={() => setSelected([])}
                            bulkActions={
                                <>
                                    <AskAiButton
                                        mode="toolbar"
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
                                                variant="destructive-outline"
                                                onClick={() =>
                                                    setPendingBulkAction(
                                                        'delete',
                                                    )
                                                }
                                            >
                                                {t('common.delete')}
                                            </Button>
                                        )}
                                    {isTrashed &&
                                        can(
                                            PermissionEnum.CanRestoreCollections,
                                        ) && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => bulk('restore')}
                                            >
                                                {t('common.restore')}
                                            </Button>
                                        )}
                                    {isTrashed &&
                                        can(
                                            PermissionEnum.CanForceDeleteCollections,
                                        ) && (
                                            <Button
                                                type="button"
                                                variant="destructive-outline"
                                                onClick={() =>
                                                    setPendingBulkAction(
                                                        'force_delete',
                                                    )
                                                }
                                            >
                                                {t('common.deletePermanently')}
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
                                    showHasDraft={versioningEnabled}
                                    hasDraft={hasDraftFilter}
                                    onHasDraftChange={(value) =>
                                        visit({ has_draft: value })
                                    }
                                    showInReview={approvalsRequired}
                                    inReview={inReviewFilter}
                                    onInReviewChange={(value) =>
                                        visit({ in_review: value })
                                    }
                                />
                            }
                        />
                    )
                }
                filtersRight={
                    hideListChrome || hasSelection ? null : (
                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={listLayout}
                                onValueChange={(value) => {
                                    if (
                                        value === 'table' ||
                                        value === 'kanban' ||
                                        value === 'calendar'
                                    ) {
                                        setLayout(value);
                                    }
                                }}
                            >
                                <SelectTrigger
                                    className="w-auto min-w-28"
                                    data-test="list-layout-select"
                                    aria-label={t(
                                        'collections.itemsList.layout',
                                    )}
                                >
                                    <SelectValue
                                        placeholder={t(
                                            'collections.itemsList.layout',
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent align="end">
                                    <SelectItem
                                        value="table"
                                        textValue={t(
                                            'collections.itemsList.layoutTable',
                                        )}
                                    >
                                        <LayoutList className="size-4" />
                                        {t('collections.itemsList.layoutTable')}
                                    </SelectItem>
                                    <SelectItem
                                        value="kanban"
                                        textValue={t(
                                            'collections.itemsList.layoutKanban',
                                        )}
                                        disabled={kanbanFields.length === 0}
                                    >
                                        <Columns3 className="size-4" />
                                        {t(
                                            'collections.itemsList.layoutKanban',
                                        )}
                                    </SelectItem>
                                    <SelectItem
                                        value="calendar"
                                        textValue={t(
                                            'collections.itemsList.layoutCalendar',
                                        )}
                                        disabled={calendarFields.length === 0}
                                    >
                                        <CalendarDays className="size-4" />
                                        {t(
                                            'collections.itemsList.layoutCalendar',
                                        )}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            {listLayout === 'kanban' &&
                            kanbanFields.length > 0 ? (
                                <Select
                                    value={kanbanField ?? undefined}
                                    onValueChange={(value) => {
                                        setKanbanField(value);
                                        persistPrefs(
                                            listColumns,
                                            columnAligns,
                                            { kanban_field: value },
                                        );
                                    }}
                                >
                                    <SelectTrigger
                                        className="w-auto min-w-36"
                                        data-test="kanban-field-select"
                                        aria-label={t(
                                            'collections.itemsList.kanbanField',
                                        )}
                                    >
                                        {kanbanField ? (
                                            <span className="text-muted-foreground">
                                                {t(
                                                    'collections.itemsList.kanbanField',
                                                )}
                                                :
                                            </span>
                                        ) : null}
                                        <SelectValue
                                            placeholder={t(
                                                'collections.itemsList.kanbanField',
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {kanbanFields.map((field) => {
                                            const label = getFieldDisplayName(
                                                field.settings,
                                                field.name,
                                            );

                                            return (
                                                <SelectItem
                                                    key={field.id}
                                                    value={field.name}
                                                    textValue={label}
                                                >
                                                    {label}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            ) : null}
                            {listLayout === 'calendar' &&
                            calendarFields.length > 0 ? (
                                <Select
                                    value={calendarField ?? undefined}
                                    onValueChange={(value) => {
                                        setCalendarField(value);
                                        persistPrefs(
                                            listColumns,
                                            columnAligns,
                                            { calendar_field: value },
                                        );
                                    }}
                                >
                                    <SelectTrigger
                                        className="w-auto min-w-36"
                                        data-test="calendar-field-select"
                                        aria-label={t(
                                            'collections.itemsList.calendarField',
                                        )}
                                    >
                                        {calendarField ? (
                                            <span className="text-muted-foreground">
                                                {t(
                                                    'collections.itemsList.calendarField',
                                                )}
                                                :
                                            </span>
                                        ) : null}
                                        <SelectValue
                                            placeholder={t(
                                                'collections.itemsList.calendarField',
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {calendarFields.map((field) => {
                                            const label = getFieldDisplayName(
                                                field.settings,
                                                field.name,
                                            );

                                            return (
                                                <SelectItem
                                                    key={field.id}
                                                    value={field.name}
                                                    textValue={label}
                                                >
                                                    {label}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            ) : null}
                            <ToggleGroup
                                variant="outline"
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
                                    aria-label={t(
                                        'collections.itemsList.activeItems',
                                    )}
                                >
                                    <FolderOpen className="size-4" />
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    value="trashed"
                                    aria-label={t(
                                        'collections.itemsList.trash',
                                    )}
                                >
                                    <Trash2 className="size-4" />
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                    )
                }
                footer={
                    !hideListChrome &&
                    listLayout === 'table' &&
                    hasTablePaginationFooter(items) ? (
                        <TablePaginationFooter pagination={items} />
                    ) : undefined
                }
            >
                {listLayout === 'kanban' ? (
                    <ItemsKanban
                        collection={collection}
                        board={
                            kanbanBoardProp &&
                            kanbanBoardProp.field === kanbanField
                                ? kanbanBoardProp
                                : null
                        }
                        filters={filters as Record<string, unknown>}
                        canEdit={can(PermissionEnum.CanEditCollections)}
                        isTrashed={isTrashed}
                    />
                ) : null}
                {listLayout === 'calendar' ? (
                    <ItemsCalendar
                        collection={collection}
                        fieldName={calendarField}
                        filters={filters as Record<string, unknown>}
                        initial={
                            calendarProp && calendarProp.field === calendarField
                                ? calendarProp
                                : null
                        }
                        canEdit={can(PermissionEnum.CanEditCollections)}
                        isTrashed={isTrashed}
                    />
                ) : null}
                {listLayout === 'table' && isListEmpty ? (
                    <PageEmptyState
                        icon={
                            hasActiveFilters
                                ? SearchX
                                : isTrashed
                                  ? Trash2
                                  : FolderOpen
                        }
                        title={
                            <EmptyStatus>
                                {hasActiveFilters
                                    ? t('emptyState.items.filteredTitle')
                                    : isTrashed
                                      ? t('emptyState.items.trashTitle')
                                      : t('emptyState.items.title')}
                            </EmptyStatus>
                        }
                        description={
                            hasActiveFilters
                                ? t('emptyState.items.filteredDescription')
                                : isTrashed
                                  ? t('emptyState.items.trashDescription')
                                  : t('emptyState.items.description')
                        }
                        action={
                            hasActiveFilters ? (
                                <Button type="button" onClick={clearFilters}>
                                    {t('common.clearFilters')}
                                </Button>
                            ) : isTrashed ? (
                                <Button
                                    type="button"
                                    onClick={() => visit({ trashed: false })}
                                >
                                    {t('common.back')}
                                </Button>
                            ) : can(PermissionEnum.CanCreateCollections) ? (
                                <Button asChild>
                                    <Link href={itemNewUrl()}>
                                        <Plus className="size-4" />
                                        {t('emptyState.items.cta')}
                                    </Link>
                                </Button>
                            ) : undefined
                        }
                        docsHref={
                            hasActiveFilters || isTrashed
                                ? undefined
                                : 'https://docs.externa.qiick.io'
                        }
                        docsLabel={
                            hasActiveFilters || isTrashed
                                ? undefined
                                : t('common.learnMore')
                        }
                    />
                ) : null}
                {listLayout === 'table' && !isListEmpty ? (
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
                                            canHide={
                                                canHideColumn && !hasSelection
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
                                            <span>
                                                {t(
                                                    'collections.columnPicker.actions',
                                                )}
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
                                                isTrashed
                                                    ? undefined
                                                    : 'cursor-pointer'
                                            }
                                            tabIndex={isTrashed ? undefined : 0}
                                            role={
                                                isTrashed ? undefined : 'link'
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
                                                    aria-label={t(
                                                        'collections.items.selectItem',
                                                        {
                                                            id: row.id,
                                                        },
                                                    )}
                                                    className={
                                                        checkboxTargetClassName
                                                    }
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
                                            <TableCell className="w-[1%] text-right whitespace-nowrap">
                                                <div
                                                    className="flex items-center justify-end gap-1"
                                                    onPointerDown={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    {versioningEnabled &&
                                                    row.has_draft ? (
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
                                                    row.approval_status !==
                                                        'draft' ? (
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
                                                            collection_id:
                                                                collection.id,
                                                            label: itemLabel(
                                                                row,
                                                            ),
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
                ) : null}
            </PageLayout>

            <ConfirmDestructiveDialog
                open={deleteItemId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteItemId(null);
                    }
                }}
                title={t('itemConfirm.deleteTitle', {
                    name: (() => {
                        const row = items.data.find(
                            (item) => item.id === deleteItemId,
                        );

                        return (
                            (row ? itemLabel(row) : null) ??
                            `#${deleteItemId ?? ''}`
                        );
                    })(),
                })}
                description={t('itemConfirm.deleteDescription')}
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
                        ? t('itemConfirm.bulkForceDeleteTitle', {
                              count: selected.length,
                          })
                        : t('itemConfirm.bulkDeleteTitle', {
                              count: selected.length,
                          })
                }
                description={
                    pendingBulkAction === 'force_delete'
                        ? t('itemConfirm.bulkForceDeleteDescription')
                        : t('itemConfirm.bulkDeleteDescription')
                }
                confirmLabel={
                    pendingBulkAction === 'force_delete'
                        ? t('confirmDestructive.deletePermanently')
                        : t('common.delete')
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
                title={t('itemConfirm.forceDeleteTitle', {
                    name: (() => {
                        const row = items.data.find(
                            (item) => item.id === pendingForceDeleteItemId,
                        );

                        return (
                            (row ? itemLabel(row) : null) ??
                            `#${pendingForceDeleteItemId ?? ''}`
                        );
                    })(),
                })}
                description={t('itemConfirm.forceDeleteDescription')}
                confirmLabel={t('confirmDestructive.deletePermanently')}
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
