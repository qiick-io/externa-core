import { Head, router } from '@inertiajs/react';
import { ArrowDownAZ, ArrowUpAZ, Trash2, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { UserFormDrawer } from '@/components/admin/user-form-drawer';
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
import { useOnlineUsers } from '@/hooks/use-online-users';
import { useRequestLeave } from '@/hooks/use-unsaved-changes';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { seedUserPrompt, seedUsersBulkPrompt } from '@/lib/ai-open';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { cn } from '@/lib/utils';
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

const USER_SORT_FIELDS: { value: UserSortField; label: string }[] = [
    { value: 'first_name', label: 'Name' },
    { value: 'last_name', label: 'Last name' },
    { value: 'email', label: 'Email' },
    { value: 'created_at', label: 'Created' },
    { value: 'updated_at', label: 'Updated' },
];

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

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [{ title: 'Users', href: adminRoutes.users.index() }],
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
                adminRoutes.users.index({
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
        setSort(filters.sort ?? 'created_at');
        setDirection(filters.direction ?? 'desc');
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
    };

    const openEdit = (user: AdminUserRow): void => {
        if (!can(PermissionEnum.CanEditUsers)) {
            return;
        }

        setEditing(user);
        setDrawerOpen(true);
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
        });
    };

    const bulk = (action: string): void => {
        router.post(
            adminRoutes.users.bulkActions(),
            { ids: selected, action },
            {
                preserveScroll: true,
                onSuccess: () => setSelected([]),
            },
        );
    };

    const hasSelection = selected.length > 0;

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
                        New user
                    </Button>
                ) : undefined
            }
        >
            <Head title="Users" />

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
                                isTrashed ? 'Search trash…' : 'Search users…'
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
                                        can(PermissionEnum.CanDeleteUsers) && (
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
                                        can(PermissionEnum.CanRestoreUsers) && (
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
                                            PermissionEnum.CanForceDeleteUsers,
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
                                        size="sm"
                                        aria-label="Sort by"
                                        className="w-[7.5rem]"
                                    >
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        {USER_SORT_FIELDS.map((field) => (
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
                                        aria-label="Active users"
                                        className="px-2.5"
                                    >
                                        <Users className="size-4" />
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
                            users.last_page > 1 ? (
                                <TablePagination links={users.links ?? []} />
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
                                {users.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-muted-foreground"
                                        >
                                            No users found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.data.map((user) => (
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
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <span className="inline-flex items-center gap-2">
                                                    <span
                                                        className={cn(
                                                            'size-2 shrink-0 rounded-full',
                                                            onlineUsers.has(
                                                                user.id,
                                                            )
                                                                ? 'bg-emerald-500'
                                                                : 'bg-muted-foreground/30',
                                                        )}
                                                        title={
                                                            onlineUsers.has(
                                                                user.id,
                                                            )
                                                                ? 'Online'
                                                                : 'Offline'
                                                        }
                                                        data-test="user-online-dot"
                                                        data-online={
                                                            onlineUsers.has(
                                                                user.id,
                                                            )
                                                                ? '1'
                                                                : '0'
                                                        }
                                                        aria-hidden
                                                    />
                                                    {userDisplayName(user)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {user.email}
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
                                                    <Badge>Active</Badge>
                                                ) : (
                                                    <Badge variant="outline">
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
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TablePanel>
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
                    }}
                />
            </Drawer>
        </AppLayout>
    );
}
