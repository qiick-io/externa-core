import { Head, Link, router } from '@inertiajs/react';
import { Plus } from 'lucide-react';
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
import type { AdminRoleRow, BreadcrumbItem, Paginated } from '@/types';

/**
 * Admin roles list with permissions overview.
 */
export default function AdminRolesIndex({
    roles: rolesProp,
}: {
    roles: LaravelPaginated<AdminRoleRow> | Paginated<AdminRoleRow>;
}) {
    const { t } = useTranslation();
    const { can } = useCan();
    const roles = normalizePaginated(rolesProp);
    const rows = roles.data;

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('settings.layout.title'),
                href: editProfile(),
            },
            {
                title: t('settings.layout.roles'),
                href: adminRoutes.roles.index(),
            },
        ],
        [t],
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
            <Head title={t('settings.layout.roles')} />

            <SettingsLayout wide>
            <PageLayout className="p-0">
                <TablePanel
                    footer={
                        roles.last_page > 1 ? (
                            <TablePagination links={roles.links ?? []} />
                        ) : undefined
                    }
                >
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
                                            <span className="inline-flex items-center gap-2">
                                                {role.name}
                                                {role.is_system && (
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        System
                                                    </span>
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {role.permissions_count ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {can(PermissionEnum.CanEditRoles) && (
                                                <Button variant="link" asChild>
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
                                            ) &&
                                                !role.is_system &&
                                                role.name !== 'super-admin' && (
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
            </SettingsLayout>
        </AppLayout>
    );
}
