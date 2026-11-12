import { Head, Link } from '@inertiajs/react';
import {
    Download,
    FolderOpen,
    Plus,
    Rows3,
    SearchX,
    Trash2,
} from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import {
    CollectionEditButton,
    CollectionEditDrawer,
    useCollectionEditDrawer,
} from '@/components/collections/collection-edit-drawer';
import { EmptyStatus } from '@/components/empty-status';
import {
    PageLayout,
    hasTablePaginationFooter,
    TablePaginationFooter,
} from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
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
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import { seedItemsBulkPrompt } from '@/lib/ai-open';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type {
    BreadcrumbItem,
    CollectionFieldRow,
    CollectionView,
    ItemRow,
} from '@/types';
import type { ColumnAlign } from './column-header-menu';
import type { RelatedFieldEntry } from './column-picker-popover';
import { ItemFiltersBuilder } from './item-filters-builder';
import { ItemsCalendar } from './items-calendar';
import type { CalendarMonthPayload } from './items-calendar';
import { ItemsIndexDialogs } from './items-index-dialogs';
import { itemLabel, itemsExportUrl } from './items-index-helpers';
import type {
    ItemsFilters,
    ListLayout,
    Paginator,
} from './items-index-helpers';
import { ItemsKanban } from './items-kanban';
import type { KanbanBoard } from './items-kanban';
import { ItemsLayoutControls } from './items-layout-controls';
import { ItemsTable } from './items-table';
import { useItemsListFilters } from './use-items-list-filters';
import { useItemsListPrefs } from './use-items-list-prefs';
import { useItemsListSelection } from './use-items-list-selection';

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
    const headerRowRef = useRef<HTMLTableRowElement>(null);
    const {
        listColumns,
        columnAligns,
        listLayout,
        kanbanField,
        setKanbanField,
        calendarField,
        setCalendarField,
        persistPrefs,
        setLayout,
        persistColumns,
    } = useItemsListPrefs({
        collectionId: collection.id,
        listColumnsProp,
        columnAlignsProp,
        listLayoutProp,
        kanbanFieldProp,
        calendarFieldProp,
        headerRowRef,
    });
    const {
        filterTitle,
        setFilterTitle,
        filterRules,
        setFilterRules,
        visit,
        clearFilters,
        applyFilterRules,
    } = useItemsListFilters({
        collectionId: collection.id,
        filters,
        perPage: items.per_page,
        listLayout,
        kanbanField,
        calendarField,
    });
    const selection = useItemsListSelection(
        collection.id,
        items.data,
        isTrashed,
    );
    const {
        selected,
        setSelected,
        toggleAll,
        toggleRow,
        bulk,
        setDeleteItemId,
        setPendingBulkAction,
        setPendingForceDeleteItemId,
    } = selection;
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

    const collectionForm = useCollectionEditDrawer();
    const canHideColumn = listColumns.length > 1;
    const activeSort = filters.sort ?? 'id';
    const activeDirection =
        filters.direction === 'asc' ? 'asc' : ('desc' as const);

    const selectedRows = items.data.filter((row) => selected.includes(row.id));

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

    const exportUrl = (format: 'csv' | 'json'): string =>
        itemsExportUrl(
            collection.id,
            format,
            filterRules,
            filterTitle,
            filters,
        );

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
                        <ItemsLayoutControls
                            listLayout={listLayout}
                            setLayout={setLayout}
                            kanbanFields={kanbanFields}
                            kanbanField={kanbanField}
                            onKanbanFieldChange={(value) => {
                                setKanbanField(value);
                                persistPrefs(listColumns, columnAligns, {
                                    kanban_field: value,
                                });
                            }}
                            calendarFields={calendarFields}
                            calendarField={calendarField}
                            onCalendarFieldChange={(value) => {
                                setCalendarField(value);
                                persistPrefs(listColumns, columnAligns, {
                                    calendar_field: value,
                                });
                            }}
                            isTrashed={isTrashed}
                            onTrashedChange={(trashed) => visit({ trashed })}
                        />
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
                                : 'https://docs.qiick.io/externa'
                        }
                        docsLabel={
                            hasActiveFilters || isTrashed
                                ? undefined
                                : t('common.learnMore')
                        }
                    />
                ) : null}
                {listLayout === 'table' && !isListEmpty ? (
                    <ItemsTable
                        collection={collection}
                        items={items}
                        headerRowRef={headerRowRef}
                        listColumns={listColumns}
                        columnAligns={columnAligns}
                        fieldsByName={fieldsByName}
                        relatedFieldsCatalog={relatedFieldsCatalog}
                        activeSort={activeSort}
                        activeDirection={activeDirection}
                        canHideColumn={canHideColumn}
                        hasSelection={hasSelection}
                        selected={selected}
                        isTrashed={isTrashed}
                        versioningEnabled={versioningEnabled}
                        approvalsRequired={approvalsRequired}
                        toggleAll={toggleAll}
                        toggleRow={toggleRow}
                        itemEditUrl={itemEditUrl}
                        onSort={(path, direction) =>
                            visit({ sort: path, direction })
                        }
                        persistPrefs={persistPrefs}
                        persistColumns={persistColumns}
                        setDeleteItemId={setDeleteItemId}
                        setPendingForceDeleteItemId={
                            setPendingForceDeleteItemId
                        }
                    />
                ) : null}
            </PageLayout>

            <ItemsIndexDialogs rows={items.data} selection={selection} />

            <CollectionEditDrawer collectionForm={collectionForm} />
        </AppLayout>
    );
}
