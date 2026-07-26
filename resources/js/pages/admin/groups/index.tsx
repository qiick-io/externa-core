import { Head, router } from '@inertiajs/react';
import { ArrowDownAZ, ArrowUpAZ, Plus, Trash2, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { GroupFormDrawer } from '@/components/admin/group-form-drawer';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import {
    PageLayout,
    TablePagination,
    TablePanel,
} from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
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
import adminRoutes from '@/lib/admin-routes';
import { seedGroupPrompt, seedGroupsBulkPrompt } from '@/lib/ai-open';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import type { AdminGroupRow, BreadcrumbItem, Paginated } from '@/types';

type GroupSortField = 'name' | 'created_at' | 'updated_at';
type GroupSortDirection = 'asc' | 'desc';

type Filters = {
    search?: string;
    trashed?: boolean;
    sort?: GroupSortField;
    direction?: GroupSortDirection;
};

const GROUP_SORT_FIELDS: { value: GroupSortField; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'created_at', label: 'Created' },
    { value: 'updated_at', label: 'Updated' },
];

/**
 * Admin groups list with search, trash, and form drawer.
 */
export default function AdminGroupsIndex({
    groups: groupsProp,
    filters = {},
}: {
    groups: LaravelPaginated<AdminGroupRow> | Paginated<AdminGroupRow>;
    filters?: Filters;
}) {
    const groups = normalizePaginated(groupsProp);
    const { can } = useCan();
    const isTrashed = filters.trashed === true;
    const [search, setSearch] = useState(filters.search ?? '');
    const [sort, setSort] = useState<GroupSortField>(filters.sort ?? 'name');
    const [direction, setDirection] = useState<GroupSortDirection>(
        filters.direction ?? 'asc',
    );
    const [selected, setSelected] = useState<number[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<AdminGroupRow | null>(null);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [{ title: 'Groups', href: adminRoutes.groups.index() }],
        [],
    );

    const visit = useCallback(
        (overrides: Partial<Filters> = {}) => {
            const nextSearch =
                overrides.search !== undefined ? overrides.search : search;
            const nextSort = overrides.sort ?? sort;
            const nextDirection = overrides.direction ?? direction;
            const nextTrashed =
                overrides.trashed !== undefined ? overrides.trashed : isTrashed;

            router.get(
                adminRoutes.groups.index({
                    query: {
                        search: nextSearch || undefined,
                        sort: nextSort,
                        direction: nextDirection,
                        trashed: nextTrashed ? true : undefined,
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
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
        // Only refetch when the user changes search. Mount / pagination remounts
        // leave search === filters.search; visiting without `page` would reset to page 1.
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

    const openCreate = (): void => {
        setEditing(null);
        setDrawerOpen(true);
    };

    const openEdit = (group: AdminGroupRow): void => {
        if (!can(PermissionEnum.CanEditGroups) || isTrashed) {
            return;
        }

        setEditing(group);
        setDrawerOpen(true);
    };

    const bulk = (action: string): void => {
        router.post(
            adminRoutes.groups.bulkActions(),
            { ids: selected, action },
            {
                preserveScroll: true,
                onSuccess: () => setSelected([]),
            },
        );
    };

    const hasSelection = selected.length > 0;

    const selectedRows = groups.data.filter((group) =>
        selected.includes(group.id),
    );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                can(PermissionEnum.CanCreateGroups) && !isTrashed ? (
                    <Button type="button" onClick={openCreate}>
                        <Plus className="mr-1 size-4" />
                        New group
                    </Button>
                ) : undefined
            }
        >
            <Head title="User groups" />

            <Drawer
                direction="right"
                open={drawerOpen}
                onOpenChange={(open) => {
                    setDrawerOpen(open);

                    if (!open) {
                        setEditing(null);
                    }
                }}
            >
                <PageLayout
                    filters={
                        <DataTableToolbar
                            search={search}
                            onSearchChange={setSearch}
                            searchPlaceholder={
                                isTrashed ? 'Search trash…' : 'Search groups…'
                            }
                            selectedCount={selected.length}
                            onClearSelection={() => setSelected([])}
                            bulkActions={
                                <>
                                    <AskAiButton
                                        mode="labeled"
                                        prompt={seedGroupsBulkPrompt(
                                            selectedRows,
                                        )}
                                    />
                                    {!isTrashed &&
                                        can(PermissionEnum.CanDeleteGroups) && (
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
                                            PermissionEnum.CanRestoreGroups,
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
                                            PermissionEnum.CanForceDeleteGroups,
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
                                            value === 'created_at' ||
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
                                        {GROUP_SORT_FIELDS.map((field) => (
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
                                        aria-label="Active groups"
                                        className="px-2.5"
                                    >
                                        <UsersRound className="size-4" />
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
                    <TablePanel
                        footer={
                            groups.last_page > 1 ? (
                                <TablePagination links={groups.links ?? []} />
                            ) : undefined
                        }
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={
                                                groups.data.length > 0 &&
                                                selected.length ===
                                                    groups.data.length
                                            }
                                            onCheckedChange={(c) =>
                                                setSelected(
                                                    c === true
                                                        ? groups.data.map(
                                                              (g) => g.id,
                                                          )
                                                        : [],
                                                )
                                            }
                                        />
                                    </TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Roles</TableHead>
                                    <TableHead>Members</TableHead>
                                    <TableHead className="w-[1%] text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groups.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="text-muted-foreground"
                                        >
                                            No groups yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    groups.data.map((group) => (
                                        <TableRow
                                            key={group.id}
                                            className={
                                                can(
                                                    PermissionEnum.CanEditGroups,
                                                ) && !isTrashed
                                                    ? 'cursor-pointer'
                                                    : undefined
                                            }
                                            onClick={() => openEdit(group)}
                                        >
                                            <TableCell
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Checkbox
                                                    checked={selected.includes(
                                                        group.id,
                                                    )}
                                                    onCheckedChange={() =>
                                                        setSelected((prev) =>
                                                            prev.includes(
                                                                group.id,
                                                            )
                                                                ? prev.filter(
                                                                      (id) =>
                                                                          id !==
                                                                          group.id,
                                                                  )
                                                                : [
                                                                      ...prev,
                                                                      group.id,
                                                                  ],
                                                        )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {group.name}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {group.slug}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {(group.roles ?? []).map(
                                                        (r) => (
                                                            <Badge
                                                                key={r.id}
                                                                variant="secondary"
                                                            >
                                                                {r.name}
                                                            </Badge>
                                                        ),
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {group.users_count ?? '—'}
                                            </TableCell>
                                            <TableCell
                                                className="text-right"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                {isTrashed ? (
                                                    <div className="inline-flex gap-1">
                                                        {can(
                                                            PermissionEnum.CanRestoreGroups,
                                                        ) && (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() =>
                                                                    router.post(
                                                                        adminRoutes.groups.restore(
                                                                            group.id,
                                                                        ),
                                                                        {},
                                                                        {
                                                                            preserveScroll: true,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                Restore
                                                            </Button>
                                                        )}
                                                        {can(
                                                            PermissionEnum.CanForceDeleteGroups,
                                                        ) && (
                                                            <Button
                                                                type="button"
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() =>
                                                                    router.delete(
                                                                        adminRoutes.groups.forceDelete(
                                                                            group.id,
                                                                        ),
                                                                        {
                                                                            preserveScroll: true,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                Delete forever
                                                            </Button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <AskAiButton
                                                        stopPropagation
                                                        prompt={seedGroupPrompt(
                                                            group,
                                                        )}
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TablePanel>
                </PageLayout>

                <GroupFormDrawer
                    editing={editing}
                    readOnly={
                        editing
                            ? !can(PermissionEnum.CanEditGroups)
                            : !can(PermissionEnum.CanCreateGroups)
                    }
                    onSuccess={() => {
                        setDrawerOpen(false);
                        setEditing(null);
                    }}
                />
            </Drawer>
        </AppLayout>
    );
}
