import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDownAZ,
    ArrowUpAZ,
    Box,
    FolderOpen,
    PackagePlus,
    MoreHorizontal,
    Pencil,
    Plus,
    RotateCcw,
    Rows3,
    SearchX,
    Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { NameSlugCell } from '@/components/admin/name-slug-cell';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import { ApplyCollectionPackDialog } from '@/components/collections/apply-collection-pack-dialog';
import type { CollectionPackSummary } from '@/components/collections/apply-collection-pack-dialog';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import {
    LucideIconByName,
    resolveCollectionIconName,
} from '@/components/collections/field-settings/lucide-icon-picker';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { EmptyStatus } from '@/components/empty-status';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer } from '@/components/ui/drawer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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
import { useCollections } from '@/hooks/use-collections';
import { useDebouncedServerSearch } from '@/hooks/use-debounced-server-search';
import { useDrawerDeepLink } from '@/hooks/use-drawer-deep-link';
import AppLayout from '@/layouts/app-layout';
import { seedCollectionPrompt, seedCollectionsBulkPrompt } from '@/lib/ai-open';
import { cn } from '@/lib/utils';
import collectionRoutes from '@/routes/collections';
import { resolveCollectionColor } from '@/types';
import type { BreadcrumbItem, CollectionRow } from '@/types';

type CollectionSortField = 'name' | 'slug' | 'status' | 'updated_at';
type CollectionSortDirection = 'asc' | 'desc';

type CollectionFilters = {
    trashed?: boolean;
    search?: string;
    sort?: CollectionSortField;
    direction?: CollectionSortDirection;
};

/**
 * List of content collections.
 * @returns {JSX.Element}
 */
export default function CollectionsIndex({
    collections,
    filters = {},
    collectionPacks = [],
}: {
    collections: CollectionRow[];
    filters?: CollectionFilters;
    collectionPacks?: CollectionPackSummary[];
}) {
    const { t } = useTranslation();
    const { can } = useCan();
    const isTrashed = filters.trashed === true;
    const [search, setSearch] = useState(filters.search ?? '');
    const [sort, setSort] = useState<CollectionSortField>(
        filters.sort ?? 'name',
    );
    const [direction, setDirection] = useState<CollectionSortDirection>(
        filters.direction ?? 'asc',
    );
    const [selected, setSelected] = useState<number[]>([]);
    const [packDialogOpen, setPackDialogOpen] = useState(false);
    const [pendingBulkAction, setPendingBulkAction] = useState<
        'delete' | 'force_delete' | null
    >(null);
    const [pendingRowDelete, setPendingRowDelete] = useState<{
        id: number;
        name: string;
        force: boolean;
    } | null>(null);
    const [confirmingDestructive, setConfirmingDestructive] = useState(false);
    const hasSelection = selected.length > 0;
    const hasActiveFilters = search.trim() !== '';
    const isListEmpty = collections.length === 0;
    const hideListChrome = isListEmpty && !hasActiveFilters && !isTrashed;

    const sortFields: { value: CollectionSortField; label: string }[] = [
        { value: 'name', label: t('collections.list.sortName') },
        { value: 'slug', label: t('collections.list.sortSlug') },
        { value: 'status', label: t('collections.list.sortStatus') },
        { value: 'updated_at', label: t('collections.list.sortUpdated') },
    ];

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Collections', href: collectionRoutes.index.url() },
    ];

    const syncClosedRef = useRef<() => void>(() => {});

    const {
        open,
        setOpen,
        editing,
        setEditing,
        slugManual,
        setSlugManual,
        form,
        title,
        submit,
        handleDrawerOpenChange,
    } = useCollections({
        onClosed: () => syncClosedRef.current(),
    });

    const deepLink = useDrawerDeepLink({
        onEdit: (id) => {
            if (!can(PermissionEnum.CanEditCollections)) {
                return;
            }

            const row = collections.find((c) => String(c.id) === id);

            if (!row) {
                return;
            }

            setEditing(row);
            setOpen(true);
        },
        onNew: () => {
            if (!can(PermissionEnum.CanCreateCollections) || isTrashed) {
                return;
            }

            setEditing(null);
            setOpen(true);
        },
    });
    useEffect(() => {
        syncClosedRef.current = deepLink.syncClosed;
    });

    const openCreate = (): void => {
        setEditing(null);
        setOpen(true);
        deepLink.syncNew();
    };

    const openEdit = (row: CollectionRow): void => {
        setEditing(row);
        setOpen(true);
        deepLink.syncEdit(row.id);
    };

    const visit = useCallback(
        (overrides: Partial<CollectionFilters> = {}) => {
            const nextSearch =
                overrides.search !== undefined ? overrides.search : search;
            const nextSort = overrides.sort ?? sort;
            const nextDirection = overrides.direction ?? direction;
            const nextTrashed =
                overrides.trashed !== undefined ? overrides.trashed : isTrashed;

            router.get(
                collectionRoutes.index.url({
                    query: {
                        search: nextSearch || undefined,
                        sort: nextSort,
                        direction: nextDirection,
                        trashed: nextTrashed ? true : undefined,
                    },
                }),
                {},
                {
                    preserveState: true,
                    preserveScroll: true,
                },
            );
        },
        [direction, isTrashed, search, sort],
    );

    useEffect(() => {
        setSearch(filters.search ?? '');
        setSort(filters.sort ?? 'name');
        setDirection(filters.direction ?? 'asc');
    }, [filters.search, filters.sort, filters.direction]);

    const onDebouncedSearch = useCallback(
        (value: string): void => {
            visit({ search: value || undefined });
        },
        [visit],
    );

    useDebouncedServerSearch(search, filters.search ?? '', onDebouncedSearch);

    useEffect(() => {
        setSelected([]);
    }, [isTrashed]);

    const toggleAll = (checked: boolean): void => {
        setSelected(checked ? collections.map((c) => c.id) : []);
    };

    const toggleRow = (id: number): void => {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
        );
    };

    const bulk = (action: 'delete' | 'restore' | 'force_delete'): void => {
        router.post(
            collectionRoutes.bulk.url(),
            { ids: selected, action },
            {
                preserveScroll: true,
                onSuccess: () => setSelected([]),
            },
        );
    };

    const selectedRows = collections.filter((c) => selected.includes(c.id));

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                !isTrashed && can(PermissionEnum.CanCreateCollections) ? (
                    <div className="flex items-center gap-2">
                        <HeaderIconButton
                            type="button"
                            variant="outline"
                            label={t(
                                'collections.packs.createFromPackEllipsis',
                            )}
                            onClick={() => setPackDialogOpen(true)}
                        >
                            <PackagePlus className="size-4" />
                        </HeaderIconButton>
                        <Button type="button" onClick={openCreate}>
                            <Plus className="size-4" />
                            {t('collections.newCollection')}
                        </Button>
                    </div>
                ) : undefined
            }
        >
            <Head title="Collections" />

            <ApplyCollectionPackDialog
                collectionPacks={collectionPacks}
                open={packDialogOpen}
                onOpenChange={setPackDialogOpen}
            />
            <Drawer
                direction="right"
                open={open}
                onOpenChange={handleDrawerOpenChange}
            >
                <PageLayout
                    filters={
                        hideListChrome ? undefined : (
                            <DataTableToolbar
                                search={search}
                                onSearchChange={setSearch}
                                searchPlaceholder={
                                    isTrashed
                                        ? 'Search trash…'
                                        : 'Search collections…'
                                }
                                selectedCount={selected.length}
                                onClearSelection={() => setSelected([])}
                                bulkActions={
                                    <>
                                        <AskAiButton
                                            mode="labeled"
                                            prompt={seedCollectionsBulkPrompt(
                                                selectedRows,
                                            )}
                                        />
                                        {!isTrashed &&
                                            can(
                                                PermissionEnum.CanDeleteCollections,
                                            ) && (
                                                <Button
                                                    type="button"
                                                    variant="destructive-outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        setPendingBulkAction(
                                                            'delete',
                                                        )
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
                                                    onClick={() =>
                                                        bulk('restore')
                                                    }
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
                                                    variant="destructive-outline"
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
                            />
                        )
                    }
                    filtersRight={
                        hideListChrome || hasSelection ? null : (
                            <div className="flex items-center gap-2">
                                <Select
                                    value={sort}
                                    onValueChange={(value) => {
                                        if (
                                            value === 'name' ||
                                            value === 'slug' ||
                                            value === 'status' ||
                                            value === 'updated_at'
                                        ) {
                                            setSort(value);
                                            visit({ sort: value });
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        size="sm"
                                        aria-label={t(
                                            'collections.list.sortBy',
                                        )}
                                        className="w-[7.5rem]"
                                    >
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {sortFields.map((field) => (
                                            <SelectItem
                                                key={field.value}
                                                value={field.value}
                                            >
                                                {field.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label={
                                        direction === 'asc'
                                            ? 'Sort ascending'
                                            : 'Sort descending'
                                    }
                                    onClick={() => {
                                        const nextDirection =
                                            direction === 'asc'
                                                ? 'desc'
                                                : 'asc';
                                        setDirection(nextDirection);
                                        visit({ direction: nextDirection });
                                    }}
                                >
                                    {direction === 'asc' ? (
                                        <ArrowUpAZ className="size-4" />
                                    ) : (
                                        <ArrowDownAZ className="size-4" />
                                    )}
                                </Button>
                                <ToggleGroup
                                    type="single"
                                    value={isTrashed ? 'trashed' : 'active'}
                                    onValueChange={(value) => {
                                        if (!value) {
                                            return;
                                        }

                                        visit({
                                            trashed: value === 'trashed',
                                        });
                                    }}
                                >
                                    <ToggleGroupItem
                                        value="active"
                                        aria-label={t('a11y.activeList')}
                                        className="px-3"
                                    >
                                        <FolderOpen className="size-4" />
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="trashed"
                                        aria-label={t('a11y.trashList')}
                                        className="px-3"
                                    >
                                        <Trash2 className="size-4" />
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </div>
                        )
                    }
                >
                    {isListEmpty ? (
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
                                        ? t(
                                              'emptyState.collections.filteredTitle',
                                          )
                                        : isTrashed
                                          ? t(
                                                'emptyState.collections.trashTitle',
                                            )
                                          : t('emptyState.collections.title')}
                                </EmptyStatus>
                            }
                            description={
                                hasActiveFilters
                                    ? t(
                                          'emptyState.collections.filteredDescription',
                                      )
                                    : isTrashed
                                      ? t(
                                            'emptyState.collections.trashDescription',
                                        )
                                      : t('emptyState.collections.description')
                            }
                            action={
                                hasActiveFilters ? (
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setSearch('');
                                            visit({ search: undefined });
                                        }}
                                    >
                                        {t('common.clearFilters')}
                                    </Button>
                                ) : isTrashed ? (
                                    <Button
                                        type="button"
                                        onClick={() =>
                                            visit({ trashed: false })
                                        }
                                    >
                                        {t('common.back')}
                                    </Button>
                                ) : can(PermissionEnum.CanCreateCollections) ? (
                                    <Button type="button" onClick={openCreate}>
                                        <Plus className="size-4" />
                                        {t('emptyState.collections.cta')}
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
                    ) : (
                        <TablePanel>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">
                                            <Checkbox
                                                checked={
                                                    collections.length > 0 &&
                                                    selected.length ===
                                                        collections.length
                                                }
                                                onCheckedChange={(c) =>
                                                    toggleAll(c === true)
                                                }
                                                aria-label={t('a11y.selectAll')}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            {t('collections.list.name')}
                                        </TableHead>
                                        <TableHead className="w-16">
                                            {t('collections.list.status')}
                                        </TableHead>
                                        <TableHead className="text-right">
                                            {t('collections.list.actions')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {collections.map((c) => {
                                        const openUrl = c.is_singleton
                                            ? collectionRoutes.show.url(c.id)
                                            : collectionRoutes.items.index.url(
                                                  c.id,
                                              );
                                        const accent = resolveCollectionColor(
                                            c.color,
                                        );
                                        const isActive =
                                            (c.status ?? 'active') === 'active';
                                        const statusLabel = isActive
                                            ? t('collections.meta.statusActive')
                                            : t(
                                                  'collections.meta.statusInactive',
                                              );

                                        return (
                                            <TableRow
                                                key={c.id}
                                                className="cursor-pointer"
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
                                                        : `Open ${c.name}`
                                                }
                                                onClick={() => {
                                                    if (!isTrashed) {
                                                        router.visit(openUrl);
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
                                                        router.visit(openUrl);
                                                    }
                                                }}
                                            >
                                                <TableCell
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                    onKeyDown={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <Checkbox
                                                        checked={selected.includes(
                                                            c.id,
                                                        )}
                                                        onCheckedChange={() =>
                                                            toggleRow(c.id)
                                                        }
                                                        aria-label={`Select ${c.name}`}
                                                    />
                                                </TableCell>
                                                <TableCell className="max-w-[20rem]">
                                                    <NameSlugCell
                                                        name={c.name}
                                                        slug={c.slug}
                                                        description={
                                                            c.description
                                                        }
                                                        leading={
                                                            <span
                                                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground"
                                                                style={
                                                                    accent
                                                                        ? {
                                                                              color: accent,
                                                                              borderColor: `${accent}55`,
                                                                              backgroundColor: `${accent}18`,
                                                                          }
                                                                        : undefined
                                                                }
                                                                aria-hidden
                                                            >
                                                                <LucideIconByName
                                                                    name={resolveCollectionIconName(
                                                                        c.icon,
                                                                    )}
                                                                    className="size-3.5"
                                                                    style={
                                                                        accent
                                                                            ? {
                                                                                  color: accent,
                                                                              }
                                                                            : undefined
                                                                    }
                                                                />
                                                            </span>
                                                        }
                                                        badge={
                                                            c.is_singleton ? (
                                                                <Tooltip>
                                                                    <TooltipTrigger
                                                                        asChild
                                                                    >
                                                                        <span className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-0.5 text-xs">
                                                                            <Box
                                                                                className="size-3.5 shrink-0"
                                                                                aria-hidden
                                                                            />
                                                                            {t(
                                                                                'collections.meta.singletonShort',
                                                                            )}
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        {t(
                                                                            'collections.meta.singleton',
                                                                        )}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            ) : null
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            isActive
                                                                ? 'success'
                                                                : 'muted'
                                                        }
                                                        className="gap-2"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'size-1.5 rounded-full',
                                                                isActive
                                                                    ? 'bg-success'
                                                                    : 'bg-muted-foreground',
                                                            )}
                                                            aria-hidden
                                                        />
                                                        {statusLabel}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell
                                                    className="text-right"
                                                    onClick={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                    onKeyDown={(event) =>
                                                        event.stopPropagation()
                                                    }
                                                >
                                                    <div
                                                        className="flex flex-nowrap items-center justify-end gap-1"
                                                        onPointerDown={(
                                                            event,
                                                        ) =>
                                                            event.stopPropagation()
                                                        }
                                                    >
                                                        <AskAiButton
                                                            stopPropagation
                                                            prompt={seedCollectionPrompt(
                                                                c,
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
                                                                        size="icon-sm"
                                                                        label="Restore"
                                                                        onClick={() =>
                                                                            router.post(
                                                                                collectionRoutes.restore.url(
                                                                                    c.id,
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
                                                                                label="More actions"
                                                                                data-test={`collection-row-menu-${c.id}`}
                                                                            >
                                                                                <MoreHorizontal className="size-3.5" />
                                                                            </HeaderIconButton>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem
                                                                                variant="destructive"
                                                                                onSelect={() =>
                                                                                    setPendingRowDelete(
                                                                                        {
                                                                                            id: c.id,
                                                                                            name: c.name,
                                                                                            force: true,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            >
                                                                                Delete
                                                                                permanently
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <HeaderIconButton
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon-sm"
                                                                    label="Edit"
                                                                    data-test={`collection-row-edit-${c.id}`}
                                                                    onClick={() =>
                                                                        openEdit(
                                                                            c,
                                                                        )
                                                                    }
                                                                >
                                                                    <Pencil className="size-3.5" />
                                                                </HeaderIconButton>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger
                                                                        asChild
                                                                    >
                                                                        <HeaderIconButton
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            label="More actions"
                                                                            data-test={`collection-row-menu-${c.id}`}
                                                                        >
                                                                            <MoreHorizontal className="size-3.5" />
                                                                        </HeaderIconButton>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem
                                                                            asChild
                                                                        >
                                                                            <Link
                                                                                href={FieldController.index.url(
                                                                                    c.id,
                                                                                )}
                                                                            >
                                                                                <Rows3 className="size-3.5" />
                                                                                Edit
                                                                                fields
                                                                            </Link>
                                                                        </DropdownMenuItem>
                                                                        {can(
                                                                            PermissionEnum.CanDeleteCollections,
                                                                        ) && (
                                                                            <>
                                                                                <DropdownMenuSeparator />
                                                                                <DropdownMenuItem
                                                                                    variant="destructive"
                                                                                    data-test={`collection-row-delete-${c.id}`}
                                                                                    onSelect={() =>
                                                                                        setPendingRowDelete(
                                                                                            {
                                                                                                id: c.id,
                                                                                                name: c.name,
                                                                                                force: false,
                                                                                            },
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Delete
                                                                                </DropdownMenuItem>
                                                                            </>
                                                                        )}
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
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
                    )}
                </PageLayout>

                <CollectionFormDrawer
                    editing={editing}
                    slugManual={slugManual}
                    setSlugManual={setSlugManual}
                    form={form}
                    title={title}
                    submit={submit}
                    onCancel={() => handleDrawerOpenChange(false)}
                />
            </Drawer>

            <ConfirmDestructiveDialog
                open={pendingBulkAction !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingBulkAction(null);
                    }
                }}
                title={
                    pendingBulkAction === 'force_delete'
                        ? selectedRows.length === 1
                            ? t(
                                  'collections.confirm.bulkForceDeleteTitleNamed',
                                  {
                                      name: selectedRows[0]?.name ?? '',
                                  },
                              )
                            : t('collections.confirm.bulkForceDeleteTitle', {
                                  count: selected.length,
                              })
                        : t('collections.confirm.bulkDeleteTitle', {
                              count: selected.length,
                          })
                }
                description={
                    pendingBulkAction === 'force_delete'
                        ? t('collections.confirm.bulkForceDeleteDescription')
                        : t('collections.confirm.bulkDeleteDescription')
                }
                confirmLabel={
                    pendingBulkAction === 'force_delete'
                        ? t('confirmDestructive.deletePermanently')
                        : t('common.delete')
                }
                typedConfirmation={
                    pendingBulkAction === 'force_delete' &&
                    selectedRows.length === 1
                        ? selectedRows[0]?.name
                        : pendingBulkAction === 'force_delete' &&
                            selectedRows.length > 1
                          ? selectedRows.map((row) => row.name).join(', ')
                          : undefined
                }
                confirming={confirmingDestructive}
                onConfirm={() => {
                    if (pendingBulkAction === null) {
                        return;
                    }

                    setConfirmingDestructive(true);
                    router.post(
                        collectionRoutes.bulk.url(),
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
                open={pendingRowDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingRowDelete(null);
                    }
                }}
                title={
                    pendingRowDelete
                        ? pendingRowDelete.force
                            ? t('collections.confirm.forceDeleteTitle', {
                                  name: pendingRowDelete.name,
                              })
                            : t('collections.confirm.deleteTitle', {
                                  name: pendingRowDelete.name,
                              })
                        : ''
                }
                description={
                    pendingRowDelete
                        ? pendingRowDelete.force
                            ? t('collections.confirm.forceDeleteDescription')
                            : t('collections.confirm.deleteDescription')
                        : ''
                }
                confirmLabel={
                    pendingRowDelete?.force
                        ? t('confirmDestructive.deletePermanently')
                        : t('common.delete')
                }
                typedConfirmation={
                    pendingRowDelete?.force ? pendingRowDelete.name : undefined
                }
                confirming={confirmingDestructive}
                onConfirm={() => {
                    if (pendingRowDelete === null) {
                        return;
                    }

                    setConfirmingDestructive(true);
                    const { id, force } = pendingRowDelete;
                    const url = force
                        ? collectionRoutes.forceDelete.url(id)
                        : collectionRoutes.destroy.url(id);

                    router.delete(url, {
                        preserveScroll: true,
                        onFinish: () => setConfirmingDestructive(false),
                        onSuccess: () => setPendingRowDelete(null),
                        onError: () => setPendingRowDelete(null),
                    });
                }}
            />
        </AppLayout>
    );
}
