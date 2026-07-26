import { Head, router } from '@inertiajs/react';
import { Trash2, UserPlus } from 'lucide-react';
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
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { seedUserPrompt, seedUsersBulkPrompt } from '@/lib/ai-open';
import { normalizePaginated  } from '@/lib/pagination';
import type {LaravelPaginated} from '@/lib/pagination';
import { cn } from '@/lib/utils';
import type { AdminUserRow, BreadcrumbItem, Paginated } from '@/types';

type Filters = {
    search?: string;
    trashed?: boolean;
    sort?: string;
    direction?: 'asc' | 'desc';
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
    const { can } = useCan();
    const onlineUsers = useOnlineUsers();
    const [search, setSearch] = useState(filters.search ?? '');
    const [trashed, setTrashed] = useState<'trashed' | 'active'>(
        filters.trashed ? 'trashed' : 'active',
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
            router.get(
                adminRoutes.users.index({
                    query: {
                        search: search || undefined,
                        trashed: trashed === 'trashed' ? true : undefined,
                        ...overrides,
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [search, trashed],
    );

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

    const isTrashed = trashed === 'trashed';
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
                can(PermissionEnum.CanCreateUsers) ? (
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
                            searchPlaceholder="Search users…"
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
                        <ToggleGroup
                            type="single"
                            value={trashed}
                            onValueChange={(value) => {
                                if (!value) {
                                    return;
                                }

                                setTrashed(value as 'trashed' | 'active');
                                visit({
                                    trashed:
                                        value === 'trashed' ? true : undefined,
                                });
                            }}
                        >
                            <ToggleGroupItem
                                value="active"
                                aria-label="Active users"
                            >
                                Active
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="trashed"
                                aria-label="Trashed users"
                            >
                                <Trash2 className="size-4" />
                            </ToggleGroupItem>
                        </ToggleGroup>
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
                                                            onlineUsers.has(user.id)
                                                                ? 'bg-emerald-500'
                                                                : 'bg-muted-foreground/30',
                                                        )}
                                                        title={
                                                            onlineUsers.has(user.id)
                                                                ? 'Online'
                                                                : 'Offline'
                                                        }
                                                        data-test="user-online-dot"
                                                        data-online={
                                                            onlineUsers.has(user.id)
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
                    readOnly={
                        editing
                            ? !can(PermissionEnum.CanEditUsers)
                            : !can(PermissionEnum.CanCreateUsers)
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
