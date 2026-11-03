import { Head, router } from '@inertiajs/react';
import {
    ArrowDownAZ,
    ArrowUpAZ,
    SearchX,
    Trash2,
    UserPlus,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { TruncatedText } from '@/components/admin/truncated-text';
import { UserAvatar } from '@/components/admin/user-avatar';
import { UserFormDrawer } from '@/components/admin/user-form-drawer';
import { AskAiButton } from '@/components/ai/ask-ai-button';
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
import { seedUserPrompt, seedUsersBulkPrompt } from '@/lib/ai-open';
import { listPerPageQuery, normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import usersRoutes from '@/routes/users';
import type { AdminUserRow, BreadcrumbItem, Paginated } from '@/types';

type UserSortField =
    'first_name' | 'last_name' | 'email' | 'created_at' | 'updated_at';
type UserSortDirection = 'asc' | 'desc';

type Filters = {
    search?: string;
    trashed?: boolean;
    sort?: UserSortField;
    direction?: UserSortDirection;
};

/**
 * Admin users list with search and form drawer.
 * @param {*} props.users - users.
 * @returns {JSX.Element}
 */
export default function AdminUsersIndex({
    users: usersProp,
    filters = {},
}: {
    users: LaravelPaginated<AdminUserRow> | Paginated<AdminUserRow>;
    filters?: Filters;
}) {
    const users = normalizePaginated(usersProp);
    const { t } = useTranslation();

    const userSortFields: { value: UserSortField; label: string }[] = [
        { value: 'first_name', label: t('common.firstName') },
        { value: 'last_name', label: t('common.lastName') },
        { value: 'email', label: t('common.email') },
        { value: 'created_at', label: t('users.columns.created') },
        { value: 'updated_at', label: t('users.columns.updated') },
    ];
    const { can } = useCan();
    const requestLeave = useRequestLeave();
    const onlineUsers = useOnlineUsers();
    const isTrashed = filters.trashed === true;
    const [search, setSearch] = useState(filters.search ?? '');
    const [sort, setSort] = useState<UserSortField>(
        filters.sort ?? 'created_at',
    );
    const [direction, setDirection] = useState<UserSortDirection>(
        filters.direction ?? 'desc',
    );
    const [selected, setSelected] = useState<number[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<AdminUserRow | null>(null);
    const [pendingBulkAction, setPendingBulkAction] = useState<
        'delete' | 'force_delete' | null
    >(null);
    const [confirmingBulk, setConfirmingBulk] = useState(false);

    const deepLink = useDrawerDeepLink({
        onEdit: (id) => {
            if (!can(PermissionEnum.CanEditUsers)) {
                return;
            }

            const row = users.data.find((u) => String(u.id) === id);

            if (!row) {
                return;
            }

            setEditing(row);
            setDrawerOpen(true);
        },
        onNew: () => {
            if (!can(PermissionEnum.CanCreateUsers) || isTrashed) {
                return;
            }

            setEditing(null);
            setDrawerOpen(true);
        },
    });

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [{ title: 'Users', href: usersRoutes.index.url() }],
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
                usersRoutes.index.url({
                    query: {
                        search: nextSearch || undefined,
                        sort: nextSort,
                        direction: nextDirection,
                        trashed: nextTrashed ? true : undefined,
                        per_page: listPerPageQuery(users.per_page),
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [direction, isTrashed, users.per_page, search, sort],
    );

    useEffect(() => {
        setSearch(filters.search ?? '');
        setSort(filters.sort ?? 'created_at');
        setDirection(filters.direction ?? 'desc');
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
        setSelected(checked ? users.data.map((u) => u.id) : []);
    };

    const toggleRow = (id: number): void => {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
        );
    };

    const openCreate = (): void => {
        setEditing(null);
        setDrawerOpen(true);
        deepLink.syncNew();
    };

    const openEdit = (user: AdminUserRow): void => {
        if (!can(PermissionEnum.CanEditUsers)) {
            return;
        }

        setEditing(user);
        setDrawerOpen(true);
        deepLink.syncEdit(user.id);
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
            usersRoutes.bulkActions.url(),
            { ids: selected, action },
            {
                preserveScroll: true,
                onSuccess: () => setSelected([]),
            },
        );
    };

    const hasSelection = selected.length > 0;
    const hasActiveFilters = search.trim() !== '';
    const isListEmpty = users.data.length === 0;
    const hideListChrome = isListEmpty && !hasActiveFilters && !isTrashed;

    const userDisplayName = (user: AdminUserRow): string =>
        [user.first_name, user.last_name].filter(Boolean).join(' ') ||
        user.email;

    const selectedRows = users.data.filter((user) =>
        selected.includes(user.id),
    );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                !isTrashed && can(PermissionEnum.CanCreateUsers) ? (
                    <Button type="button" onClick={openCreate}>
                        <UserPlus className="mr-1 size-4" />
                        {t('users.newUser')}
                    </Button>
                ) : undefined
            }
        >
            <Head title={t('users.title')} />

            <Drawer
                direction="right"
                open={drawerOpen}
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
                                        ? t('users.searchTrashPlaceholder')
                                        : t('users.searchPlaceholder')
                                }
                                selectedCount={selected.length}
                                onClearSelection={() => setSelected([])}
                                bulkActions={
                                    <>
                                        <AskAiButton
                                            mode="labeled"
                                            prompt={seedUsersBulkPrompt(
                                                selectedRows.map((user) => ({
                                                    id: user.id,
                                                    name: userDisplayName(user),
                                                    email: user.email,
                                                })),
                                            )}
                                        />
                                        {!isTrashed &&
                                            can(
                                                PermissionEnum.CanDeleteUsers,
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
                                                PermissionEnum.CanRestoreUsers,
                                            ) && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() =>
                                                        bulk('restore')
                                                    }
                                                >
                                                    {t('common.restore')}
                                                </Button>
                                            )}
                                        {isTrashed &&
                                            can(
                                                PermissionEnum.CanForceDeleteUsers,
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
                                                    {t(
                                                        'common.deletePermanently',
                                                    )}
                                                </Button>
                                            )}
                                    </>
                                }
                            />
                        )
                    }
                    filtersRight={
                        hideListChrome || hasSelection ? null : (
                            <div className="flex items-center gap-1.5">
                                <Select
                                    value={sort}
                                    onValueChange={(value) => {
                                        if (
                                            value === 'first_name' ||
                                            value === 'last_name' ||
                                            value === 'email' ||
                                            value === 'created_at' ||
                                            value === 'updated_at'
                                        ) {
                                            setSort(value);
                                            visit({ sort: value });
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        aria-label={t('users.sortBy')}
                                        className="w-[7.5rem]"
                                    >
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {userSortFields.map((field) => (
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
                                            ? t('common.sortAscending')
                                            : t('common.sortDescending')
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
                                        aria-label={t('users.activeUsers')}
                                        className="px-2.5"
                                    >
                                        <Users className="size-4" />
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
                    {isListEmpty ? (
                        <PageEmptyState
                            icon={
                                hasActiveFilters
                                    ? SearchX
                                    : isTrashed
                                      ? Trash2
                                      : Users
                            }
                            title={
                                <EmptyStatus>
                                    {hasActiveFilters
                                        ? t('emptyState.users.filteredTitle')
                                        : isTrashed
                                          ? t('emptyState.users.trashTitle')
                                          : t('emptyState.users.title')}
                                </EmptyStatus>
                            }
                            description={
                                hasActiveFilters
                                    ? t('emptyState.users.filteredDescription')
                                    : isTrashed
                                      ? t('emptyState.users.trashDescription')
                                      : t('emptyState.users.description')
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
                                ) : can(PermissionEnum.CanCreateUsers) ? (
                                    <Button type="button" onClick={openCreate}>
                                        <UserPlus className="size-4" />
                                        {t('emptyState.users.cta')}
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <TablePanel
                            footer={
                                hasTablePaginationFooter(users) ? (
                                    <TablePaginationFooter pagination={users} />
                                ) : undefined
                            }
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">
                                            <Checkbox
                                                checked={
                                                    users.data.length > 0 &&
                                                    selected.length ===
                                                        users.data.length
                                                }
                                                onCheckedChange={(c) =>
                                                    toggleAll(c === true)
                                                }
                                                aria-label={t('a11y.selectAll')}
                                            />
                                        </TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Roles</TableHead>
                                        <TableHead>Groups</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-[1%] text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.data.map((user) => (
                                        <TableRow
                                            key={user.id}
                                            className={
                                                can(PermissionEnum.CanEditUsers)
                                                    ? 'cursor-pointer'
                                                    : undefined
                                            }
                                            onClick={() => openEdit(user)}
                                        >
                                            <TableCell
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <Checkbox
                                                    checked={selected.includes(
                                                        user.id,
                                                    )}
                                                    onCheckedChange={() =>
                                                        toggleRow(user.id)
                                                    }
                                                    aria-label={`Select ${userDisplayName(user)}`}
                                                />
                                            </TableCell>
                                            <TableCell className="max-w-[12rem] font-medium">
                                                <span className="inline-flex min-w-0 items-center gap-2">
                                                    <UserAvatar
                                                        user={user}
                                                        isOnline={onlineUsers.has(
                                                            user.id,
                                                        )}
                                                    />
                                                    <TruncatedText
                                                        text={userDisplayName(
                                                            user,
                                                        )}
                                                    />
                                                </span>
                                            </TableCell>
                                            <TableCell className="max-w-[12rem] text-muted-foreground">
                                                <TruncatedText
                                                    text={user.email}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {user.roles.map((r) => (
                                                        <Badge
                                                            key={r.id}
                                                            variant="secondary"
                                                        >
                                                            {r.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {user.groups.map((g) => (
                                                        <Badge
                                                            key={g.id}
                                                            variant="outline"
                                                        >
                                                            {g.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {user.is_active ? (
                                                    <Badge
                                                        variant="success"
                                                        className="gap-1.5"
                                                    >
                                                        <span
                                                            className="size-1.5 rounded-full bg-success"
                                                            aria-hidden
                                                        />
                                                        Active
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="muted"
                                                        className="gap-1.5"
                                                    >
                                                        <span
                                                            className="size-1.5 rounded-full bg-muted-foreground"
                                                            aria-hidden
                                                        />
                                                        Inactive
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell
                                                className="text-right"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <AskAiButton
                                                    stopPropagation
                                                    prompt={seedUserPrompt({
                                                        id: user.id,
                                                        name: userDisplayName(
                                                            user,
                                                        ),
                                                        email: user.email,
                                                    })}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TablePanel>
                    )}
                </PageLayout>

                <UserFormDrawer
                    editing={editing}
                    open={drawerOpen}
                    readOnly={
                        editing
                            ? !can(PermissionEnum.CanEditUsers)
                            : !can(PermissionEnum.CanCreateUsers)
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
                        ? t('users.confirm.bulkForceDeleteTitle', {
                              count: selected.length,
                          })
                        : t('users.confirm.bulkDeleteTitle', {
                              count: selected.length,
                          })
                }
                description={
                    pendingBulkAction === 'force_delete'
                        ? t('users.confirm.bulkForceDeleteDescription')
                        : t('users.confirm.bulkDeleteDescription')
                }
                confirmLabel={
                    pendingBulkAction === 'force_delete'
                        ? t('confirmDestructive.deletePermanently')
                        : t('common.delete')
                }
                confirming={confirmingBulk}
                onConfirm={() => {
                    if (pendingBulkAction === null) {
                        return;
                    }

                    setConfirmingBulk(true);
                    router.post(
                        usersRoutes.bulkActions.url(),
                        { ids: selected, action: pendingBulkAction },
                        {
                            preserveScroll: true,
                            onFinish: () => setConfirmingBulk(false),
                            onSuccess: () => {
                                setSelected([]);
                                setPendingBulkAction(null);
                            },
                            onError: () => setPendingBulkAction(null),
                        },
                    );
                }}
            />
        </AppLayout>
    );
}
