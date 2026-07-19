import { Head, Link, router } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import {
    PageLayout,
    TablePanel,
} from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
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
import { normalizePaginated  } from '@/lib/pagination';
import type {LaravelPaginated} from '@/lib/pagination';
import type { AdminRoleRow, BreadcrumbItem, Paginated } from '@/types';

/**
 * Admin roles list with permissions overview.
 * @param {*} props.roles - roles.
 * @returns {JSX.Element}
 */
export default function AdminRolesIndex({
    roles: rolesProp,
}: {
    roles: LaravelPaginated<AdminRoleRow> | Paginated<AdminRoleRow>;
}) {
    const { can } = useCan();
    const rows = normalizePaginated(rolesProp).data;

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [{ title: 'Roles', href: adminRoutes.roles.index() }],
        [],
    );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                can(PermissionEnum.CanCreateRoles) ? (
                    <Button asChild>
                        <Link href={adminRoutes.roles.create()}>
                            <Plus className="mr-1 size-4" />
                            New role
                        </Link>
                    </Button>
                ) : undefined
            }
        >
            <Head title="Roles" />

            <PageLayout>
                <TablePanel>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Permissions</TableHead>
                                <TableHead className="text-right">
                                    Actions
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={3}
                                        className="text-muted-foreground"
                                    >
                                        No roles yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((role) => (
                                    <TableRow key={role.id}>
                                        <TableCell className="font-medium">
                                            {role.name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {role.permissions_count ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {can(PermissionEnum.CanEditRoles) && (
                                                <Button
                                                    variant="link"
                                                    asChild
                                                >
                                                    <Link
                                                        href={adminRoutes.roles.edit(
                                                            role.id,
                                                        )}
                                                    >
                                                        Edit
                                                    </Link>
                                                </Button>
                                            )}
                                            {can(
                                                PermissionEnum.CanDeleteRoles,
                                            ) && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive"
                                                    onClick={() =>
                                                        router.delete(
                                                            adminRoutes.roles.destroy(
                                                                role.id,
                                                            ),
                                                            {
                                                                preserveScroll: true,
                                                            },
                                                        )
                                                    }
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TablePanel>
            </PageLayout>
        </AppLayout>
    );
}
