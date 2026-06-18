import { Head, router } from '@inertiajs/react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import {
    AdminPageLayout,
    AdminTablePanel,
} from '@/components/admin/admin-page-layout';
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
import { normalizePaginated, type LaravelPaginated } from '@/lib/pagination';
import type { AdminPermissionRow, BreadcrumbItem, Paginated } from '@/types';

export default function AdminPermissionsIndex({
    permissions: permissionsProp,
}: {
    permissions:
        | LaravelPaginated<AdminPermissionRow>
        | Paginated<AdminPermissionRow>;
}) {
    const permissions = normalizePaginated(permissionsProp).data;
    const { can } = useCan();

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Admin', href: adminRoutes.permissions.index() },
            {
                title: 'Permissions',
                href: adminRoutes.permissions.index(),
            },
        ],
        [],
    );

    const sync = (): void => {
        router.post(
            adminRoutes.permissions.sync(),
            {},
            { preserveScroll: true },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Permissions" />

            <AdminPageLayout
                title="Permissions"
                icon={ShieldCheck}
                description={
                    <>
                        Permissions are defined in{' '}
                        <code className="text-xs">PermissionEnum</code> and
                        synced to the database. Assign them to roles on the role
                        edit page.
                    </>
                }
                actions={
                    can(PermissionEnum.CanEditPermissions) ? (
                        <Button type="button" onClick={sync}>
                            <RefreshCw className="mr-1 size-4" />
                            Sync from enum
                        </Button>
                    ) : undefined
                }
            >
                <AdminTablePanel>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Guard</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {permissions.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={2}
                                        className="text-muted-foreground"
                                    >
                                        No permissions in database. Run sync.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                permissions.map((perm) => (
                                    <TableRow key={perm.id}>
                                        <TableCell className="font-mono text-sm">
                                            {perm.name}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {perm.guard_name}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </AdminTablePanel>
            </AdminPageLayout>
        </AppLayout>
    );
}
