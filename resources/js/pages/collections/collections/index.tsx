import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDownAZ,
    ArrowUpAZ,
    FolderOpen,
    PackagePlus,
    Pencil,
    Plus,
    RotateCcw,
    Rows3,
    Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import {
    ApplyCollectionPackDialog,
    type CollectionPackSummary,
} from '@/components/collections/apply-collection-pack-dialog';
import { CollectionFormDrawer } from '@/components/collections/collection-form-drawer';
import { PageLayout, TablePanel } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer } from '@/components/ui/drawer';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCollections } from '@/hooks/use-collections';
import AppLayout from '@/layouts/app-layout';
import {
    seedCollectionPrompt,
    seedCollectionsBulkPrompt,
} from '@/lib/ai-open';
import collectionRoutes from '@/routes/collections';
import type { BreadcrumbItem, CollectionRow } from '@/types';

type CollectionSortField = 'name' | 'slug' | 'updated_at';
type CollectionSortDirection = 'asc' | 'desc';

type CollectionFilters = {
    trashed?: boolean;
    search?: string;
    sort?: CollectionSortField;
    direction?: CollectionSortDirection;
};

const COLLECTION_SORT_FIELDS: {
    value: CollectionSortField;
    label: string;
}[] = [
    { value: 'name', label: 'Name' },
    { value: 'slug', label: 'Slug' },
    { value: 'updated_at', label: 'Updated' },
];

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
    const hasSelection = selected.length > 0;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Collections', href: collectionRoutes.index.url() },
    ];

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
    } = useCollections();

    const visit = useCallback(
        (overrides: Partial<CollectionFilters> = {}) => {
            const nextSearch =
                overrides.search !== undefined ? overrides.search : search;
            const nextSort = overrides.sort ?? sort;
            const nextDirection = overrides.direction ?? direction;
            const nextTrashed =
                overrides.trashed !== undefined
                    ? overrides.trashed
                    : isTrashed;

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

    useEffect(() => {
        if (search === (filters.search ?? '')) {
            return;
        }

        const timer = setTimeout(() => {
            visit({ search: search || undefined });
        }, 350);

        return () => clearTimeout(timer);
    }, [search, filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

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
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPackDialogOpen(true)}
                        >
                            <PackagePlus className="mr-1 size-4" />
                            {t('collections.packs.createFromPackEllipsis')}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            <Plus className="mr-1 size-4" />
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
                        />
                    }
                    filtersRight={
                        hasSelection ? null : (
                            <div className="flex items-center gap-1.5">
                                <Select
                                    value={sort}
                                    onValueChange={(value) => {
                                        if (
                                            value === 'name' ||
                                            value === 'slug' ||
                                            value === 'updated_at'
                                        ) {
                                            setSort(value);
                                            visit({ sort: value });
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        size="sm"
                                        aria-label="Sort by"
                                        className="w-[7.5rem]"
                                    >
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {COLLECTION_SORT_FIELDS.map(
                                            (field) => (
                                                <SelectItem
                                                    key={field.value}
                                                    value={field.value}
                                                >
                                                    {field.label}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-8"
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
                                        aria-label="Active collections"
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
                            </div>
                        )
                    }
                >
                    <TablePanel>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-sidebar-border/70 text-left">
                                    <th className="w-10 p-3">
                                        <Checkbox
                                            checked={
                                                collections.length > 0 &&
                                                selected.length ===
                                                    collections.length
                                            }
                                            onCheckedChange={(c) =>
                                                toggleAll(c === true)
                                            }
                                            aria-label="Select all"
                                        />
                                    </th>
                                    <th className="p-3 font-medium">Name</th>
                                    <th className="p-3 font-medium">Slug</th>
                                    <th className="p-3 font-medium">Type</th>
                                    <th className="p-3 text-right font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {collections.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="p-4 text-muted-foreground"
                                        >
                                            {search
                                                ? 'No collections match your search.'
                                                : 'No collections yet.'}
                                        </td>
                                    </tr>
                                ) : (
                                    collections.map((c) => {
                                        const openUrl = c.is_singleton
                                            ? collectionRoutes.show.url(c.id)
                                            : collectionRoutes.items.index.url(
                                                  c.id,
                                              );

                                        return (
                                            <tr
                                                key={c.id}
                                                className="border-b border-sidebar-border/40 last:border-0 cursor-pointer"
                                                tabIndex={
                                                    isTrashed
                                                        ? undefined
                                                        : 0
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
                                                <td
                                                    className="p-3"
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
                                                </td>
                                                <td className="p-3 font-medium">
                                                    {c.name}
                                                </td>
                                                <td className="p-3 text-muted-foreground">
                                                    {c.slug}
                                                </td>
                                                <td className="p-3">
                                                    {c.is_singleton ? (
                                                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                                                            Singleton
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div
                                                        className="flex flex-wrap justify-end gap-2"
                                                        onClick={(event) =>
                                                            event.stopPropagation()
                                                        }
                                                        onKeyDown={(event) =>
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
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            router.post(
                                                                                collectionRoutes.restore.url(
                                                                                    c.id,
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
                                                                                collectionRoutes.forceDelete.url(
                                                                                    c.id,
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
                                                                        href={FieldController.index.url(
                                                                            c.id,
                                                                        )}
                                                                    >
                                                                        <Rows3 className="size-3.5" />
                                                                        Edit fields
                                                                    </Link>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setEditing(
                                                                            c,
                                                                        );
                                                                        setOpen(
                                                                            true,
                                                                        );
                                                                    }}
                                                                >
                                                                    <Pencil className="size-3.5" />
                                                                    Edit
                                                                </Button>
                                                                {can(
                                                                    PermissionEnum.CanDeleteCollections,
                                                                ) && (
                                                                    <Button
                                                                        type="button"
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            router.delete(
                                                                                collectionRoutes.destroy.url(
                                                                                    c.id,
                                                                                ),
                                                                            )
                                                                        }
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                        Delete
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </TablePanel>
                </PageLayout>

                <CollectionFormDrawer
                    editing={editing}
                    slugManual={slugManual}
                    setSlugManual={setSlugManual}
                    form={form}
                    title={title}
                    submit={submit}
                />
            </Drawer>
        </AppLayout>
    );
}
