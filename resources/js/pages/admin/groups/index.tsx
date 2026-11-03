import { Head, router } from '@inertiajs/react';
import { ArrowDownAZ, ArrowUpAZ, Plus, Trash2, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { GroupFormDrawer } from '@/components/admin/group-form-drawer';
import { TruncatedText } from '@/components/admin/truncated-text';
import { UserAvatar } from '@/components/admin/user-avatar';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import {
    PageLayout,
    hasTablePaginationFooter,
    TablePaginationFooter,
    TablePanel,
} from '@/components/layout/page-layout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { useDebouncedServerSearch } from '@/hooks/use-debounced-server-search';
import { useDrawerDeepLink } from '@/hooks/use-drawer-deep-link';
import { useOnlineUsers } from '@/hooks/use-online-users';
import { useRequestLeave } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import { seedGroupPrompt, seedGroupsBulkPrompt } from '@/lib/ai-open';
import { listPerPageQuery, normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import groupsRoutes from '@/routes/groups';
import type { AdminGroupRow, BreadcrumbItem, Paginated } from '@/types';

/** Member avatars shown before the count in the Members column. */
const MEMBER_AVATAR_LIMIT = 3;

type GroupSortField = 'name' | 'created_at' | 'updated_at';
type GroupSortDirection = 'asc' | 'desc';

type Filters = {
    search?: string;
    trashed?: boolean;
    sort?: GroupSortField;
    direction?: GroupSortDirection;
};

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
    const { t } = useTranslation();

    const groupSortFields: { value: GroupSortField; label: string }[] = [
        { value: 'name', label: t('common.name') },
        { value: 'created_at', label: t('common.created') },
        { value: 'updated_at', label: t('common.updated') },
    ];
    const { can } = useCan();
    const onlineUsers = useOnlineUsers();
    const requestLeave = useRequestLeave();
    const isTrashed = filters.trashed === true;
    const [search, setSearch] = useState(filters.search ?? '');
    const [sort, setSort] = useState<GroupSortField>(filters.sort ?? 'name');
    const [direction, setDirection] = useState<GroupSortDirection>(
        filters.direction ?? 'asc',
    );
    const [selected, setSelected] = useState<number[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<AdminGroupRow | null>(null);
    const [pendingBulkAction, setPendingBulkAction] = useState<
        'delete' | 'force_delete' | null
    >(null);
    const [pendingForceDeleteGroupId, setPendingForceDeleteGroupId] = useState<
        number | null
    >(null);
    const [confirmingDestructive, setConfirmingDestructive] = useState(false);

    const deepLink = useDrawerDeepLink({
        onEdit: (id) => {
            if (!can(PermissionEnum.CanEditGroups) || isTrashed) {
                return;
            }

            const row = groups.data.find((g) => String(g.id) === id);

            if (!row) {
                return;
            }

            setEditing(row);
            setDrawerOpen(true);
        },
        onNew: () => {
            if (!can(PermissionEnum.CanCreateGroups) || isTrashed) {
                return;
            }

            setEditing(null);
            setDrawerOpen(true);
        },
    });

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [{ title: 'Groups', href: groupsRoutes.index.url() }],
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
                groupsRoutes.index.url({
                    query: {
                        search: nextSearch || undefined,
                        sort: nextSort,
                        direction: nextDirection,
                        trashed: nextTrashed ? true : undefined,
                        per_page: listPerPageQuery(groups.per_page),
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [direction, isTrashed, groups.per_page, search, sort],
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

    const openCreate = (): void => {
        setEditing(null);
        setDrawerOpen(true);
        deepLink.syncNew();
    };

    const openEdit = (group: AdminGroupRow): void => {
        if (!can(PermissionEnum.CanEditGroups) || isTrashed) {
            return;
        }

        setEditing(group);
        setDrawerOpen(true);
        deepLink.syncEdit(group.id);
    };

    const handleDrawerOpenChange = (open: boolean): void => {
        if (open) {
            setDrawerOpen(true);

            return;
        }

        void requestLeave().then((ok) => {
            if (!ok) {
                return;
            }

            setDrawerOpen(false);
            setEditing(null);
            deepLink.syncClosed();
        });
    };

    const bulk = (action: string): void => {
        router.post(
            groupsRoutes.bulkActions.url(),
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

    const pendingForceDeleteGroup = groups.data.find(
        (group) => group.id === pendingForceDeleteGroupId,
    );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                can(PermissionEnum.CanCreateGroups) && !isTrashed ? (
                    <Button type="button" onClick={openCreate}>
                        <Plus className="mr-1 size-4" />
                        {t('groups.newGroup')}
                    </Button>
                ) : undefined
            }
        >
            <Head title={t('groups.title')} />

            <Drawer
                direction="right"
                open={drawerOpen}
                onOpenChange={handleDrawerOpenChange}
            >
                <PageLayout
                    filters={
                        <DataTableToolbar
                            search={search}
                            onSearchChange={setSearch}
                            searchPlaceholder={
                                isTrashed
                                    ? t('groups.searchTrashPlaceholder')
                                    : t('groups.searchPlaceholder')
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
                                            PermissionEnum.CanRestoreGroups,
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
                                            PermissionEnum.CanForceDeleteGroups,
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
                                        aria-label={t('groups.sortBy')}
                                        className="w-[7.5rem]"
                                    >
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {groupSortFields.map((field) => (
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
                                    variant="outline"
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
                                        aria-label={t('groups.title')}
                                        className="px-2.5"
                                    >
                                        <UsersRound className="size-4" />
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="trashed"
                                        aria-label={t('a11y.trashList')}
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
                            hasTablePaginationFooter(groups) ? (
                                <TablePaginationFooter pagination={groups} />
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
                                    <TableHead className="text-right">
                                        Members
                                    </TableHead>
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
                                            <TableCell className="max-w-[14rem] font-medium">
                                                <span className="inline-flex min-w-0 items-center gap-2">
                                                    <Avatar
                                                        userId={`group-${group.id}`}
                                                        className="size-7"
                                                        data-test="group-avatar"
                                                        aria-hidden
                                                    >
                                                        <AvatarFallback className="text-xs font-medium">
                                                            {group.name
                                                                .trim()
                                                                .charAt(0)
                                                                .toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <TruncatedText
                                                        text={group.name}
                                                    />
                                                </span>
                                            </TableCell>
                                            <TableCell className="max-w-[14rem]">
                                                <TruncatedText
                                                    text={group.slug}
                                                    className="font-mono text-xs text-muted-foreground"
                                                />
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
                                            <TableCell className="text-right tabular-nums">
                                                <span className="inline-flex items-center justify-end gap-2">
                                                    {(group.users ?? [])
                                                        .length > 0 ? (
                                                        <span
                                                            className="flex gap-1"
                                                            data-test={`group-member-avatars-${group.id}`}
                                                        >
                                                            {(group.users ?? [])
                                                                .slice(
                                                                    0,
                                                                    MEMBER_AVATAR_LIMIT,
                                                                )
                                                                .map(
                                                                    (
                                                                        member,
                                                                    ) => (
                                                                        <UserAvatar
                                                                            key={
                                                                                member.id
                                                                            }
                                                                            user={
                                                                                member
                                                                            }
                                                                            isOnline={onlineUsers.has(
                                                                                member.id,
                                                                            )}
                                                                        />
                                                                    ),
                                                                )}
                                                        </span>
                                                    ) : null}
                                                    {group.users_count ?? '—'}
                                                </span>
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
                                                                data-test={`group-row-restore-${group.id}`}
                                                                onClick={() =>
                                                                    router.post(
                                                                        groupsRoutes.restore.url(
                                                                            group.id,
                                                                        ),
                                                                        {},
                                                                        {
                                                                            preserveScroll: true,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'common.restore',
                                                                )}
                                                            </Button>
                                                        )}
                                                        {can(
                                                            PermissionEnum.CanForceDeleteGroups,
                                                        ) && (
                                                            <Button
                                                                type="button"
                                                                variant="destructive-outline"
                                                                size="sm"
                                                                data-test={`group-row-force-delete-${group.id}`}
                                                                onClick={() =>
                                                                    setPendingForceDeleteGroupId(
                                                                        group.id,
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'common.deletePermanently',
                                                                )}
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
                    open={drawerOpen}
                    readOnly={
                        editing
                            ? !can(PermissionEnum.CanEditGroups)
                            : !can(PermissionEnum.CanCreateGroups)
                    }
                    onCancel={() => handleDrawerOpenChange(false)}
                    onSuccess={() => {
                        setDrawerOpen(false);
                        setEditing(null);
                        deepLink.syncClosed();
                    }}
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
                        ? t('groups.confirm.bulkForceDeleteTitle', {
                              count: selected.length,
                          })
                        : t('groups.confirm.bulkDeleteTitle', {
                              count: selected.length,
                          })
                }
                description={
                    pendingBulkAction === 'force_delete'
                        ? t('groups.confirm.bulkForceDeleteDescription')
                        : t('groups.confirm.bulkDeleteDescription')
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
                        groupsRoutes.bulkActions.url(),
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
                open={pendingForceDeleteGroupId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingForceDeleteGroupId(null);
                    }
                }}
                title={
                    pendingForceDeleteGroup
                        ? t('groups.confirm.forceDeleteTitle', {
                              name: pendingForceDeleteGroup.name,
                          })
                        : t('groups.confirm.forceDeleteDescription')
                }
                description={t('groups.confirm.forceDeleteDescription')}
                confirmLabel={t('confirmDestructive.deletePermanently')}
                typedConfirmation={pendingForceDeleteGroup?.name}
                confirming={confirmingDestructive}
                onConfirm={() => {
                    if (pendingForceDeleteGroupId === null) {
                        return;
                    }

                    setConfirmingDestructive(true);
                    router.delete(
                        groupsRoutes.forceDelete.url(pendingForceDeleteGroupId),
                        {
                            preserveScroll: true,
                            onFinish: () => setConfirmingDestructive(false),
                            onSuccess: () => setPendingForceDeleteGroupId(null),
                            onError: () => setPendingForceDeleteGroupId(null),
                        },
                    );
                }}
            />
        </AppLayout>
    );
}
