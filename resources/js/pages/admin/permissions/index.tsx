import { Head, router } from '@inertiajs/react';
import { RefreshCw } from 'lucide-react';
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
import type { AdminPermissionRow, BreadcrumbItem, Paginated } from '@/types';

/**
 * Read-only permissions reference for admins.
 * @param {*} props.permissions - permissions.
 * @returns {JSX.Element}
 */
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
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                can(PermissionEnum.CanEditPermissions) ? (
                    <Button type="button" onClick={sync}>
                        <RefreshCw className="mr-1 size-4" />
                        Sync from enum
                    </Button>
                ) : undefined
            }
        >
            <Head title="Permissions" />

            <PageLayout
                description={
                    <>
                        Permissions are defined in{' '}
                        <code className="text-xs">PermissionEnum</code> and
                        synced to the database. Assign them to roles on the role
                        edit page.
                    </>
                }
            >
                <TablePanel>
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
                </TablePanel>
            </PageLayout>
        </AppLayout>
    );
}
