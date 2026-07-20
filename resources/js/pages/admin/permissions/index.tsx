import { Head, router } from '@inertiajs/react';
import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    PageLayout,
    TablePagination,
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
import SettingsLayout from '@/layouts/settings/layout';
import adminRoutes from '@/lib/admin-routes';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { edit as editProfile } from '@/routes/profile';
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
    const { t } = useTranslation();
    const permissions = normalizePaginated(permissionsProp);
    const { can } = useCan();

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('settings.layout.title'),
                href: editProfile(),
            },
            {
                title: t('settings.layout.permissions'),
                href: adminRoutes.permissions.index(),
            },
        ],
        [t],
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
            <Head title={t('settings.layout.permissions')} />

            <SettingsLayout wide>
            <PageLayout
                className="p-0"
                description={
                    <>
                        Permissions are defined in{' '}
                        <code className="text-xs">PermissionEnum</code> and
                        synced to the database. Assign them to roles on the role
                        edit page.
                    </>
                }
            >
                <TablePanel
                    footer={
                        permissions.last_page > 1 ? (
                            <TablePagination
                                links={permissions.links ?? []}
                            />
                        ) : undefined
                    }
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Guard</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(permissions.data ?? []).length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={2}
                                        className="text-muted-foreground"
                                    >
                                        No permissions in database. Run sync.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                (permissions.data ?? []).map((perm) => (
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
            </SettingsLayout>
        </AppLayout>
    );
}
