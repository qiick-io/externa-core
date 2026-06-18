import { Head, router } from '@inertiajs/react';
import { Plus, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AdminPageLayout,
    AdminTablePanel,
} from '@/components/admin/admin-page-layout';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { GroupFormDrawer } from '@/components/admin/group-form-drawer';
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
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { normalizePaginated, type LaravelPaginated } from '@/lib/pagination';
import type { AdminGroupRow, BreadcrumbItem, Paginated } from '@/types';

export default function AdminGroupsIndex({
    groups: groupsProp,
    filters = {},
}: {
    groups: LaravelPaginated<AdminGroupRow> | Paginated<AdminGroupRow>;
    filters?: { search?: string };
}) {
    const groups = normalizePaginated(groupsProp);
    const { can } = useCan();
    const [search, setSearch] = useState(filters.search ?? '');
    const [selected, setSelected] = useState<number[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<AdminGroupRow | null>(null);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Admin', href: adminRoutes.groups.index() },
            { title: 'Groups', href: adminRoutes.groups.index() },
        ],
        [],
    );

    const visit = useCallback(() => {
        router.get(
            adminRoutes.groups.index({
                query: { search: search || undefined },
            }),
            {},
            { preserveState: true, preserveScroll: true },
        );
    }, [search]);

    useEffect(() => {
        const timer = setTimeout(visit, 350);

        return () => clearTimeout(timer);
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const openCreate = (): void => {
        setEditing(null);
        setDrawerOpen(true);
    };

    const openEdit = (group: AdminGroupRow): void => {
        if (!can(PermissionEnum.CanEditGroups)) {
            return;
        }

        setEditing(group);
        setDrawerOpen(true);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
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
                <AdminPageLayout
                    title="User groups"
                    icon={UsersRound}
                    actions={
                        can(PermissionEnum.CanCreateGroups) ? (
                            <Button type="button" onClick={openCreate}>
                                <Plus className="mr-1 size-4" />
                                New group
                            </Button>
                        ) : undefined
                    }
                    filtersLeft={
                        <DataTableToolbar
                            search={search}
                            onSearchChange={setSearch}
                            searchPlaceholder="Search groups…"
                            selectedCount={selected.length}
                            onClearSelection={() => setSelected([])}
                            bulkActions={
                                can(PermissionEnum.CanDeleteGroups) ? (
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() =>
                                            router.delete(
                                                adminRoutes.groups.bulkDestroy(),
                                                {
                                                    data: { ids: selected },
                                                    preserveScroll: true,
                                                    onSuccess: () =>
                                                        setSelected([]),
                                                },
                                            )
                                        }
                                    >
                                        Delete
                                    </Button>
                                ) : null
                            }
                        />
                    }
                >
                    <AdminTablePanel>
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
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groups.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
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
                                                can(PermissionEnum.CanEditGroups)
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
                                                    {(group.roles ?? []).map((r) => (
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
                                                {group.users_count ?? '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </AdminTablePanel>
                </AdminPageLayout>

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
