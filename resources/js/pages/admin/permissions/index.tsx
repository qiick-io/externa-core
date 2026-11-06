import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/admin/data-table';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { PageLayout } from '@/components/layout/page-layout';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import permissionsRoutes from '@/routes/permissions';
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
        LaravelPaginated<AdminPermissionRow> | Paginated<AdminPermissionRow>;
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
                href: permissionsRoutes.index.url(),
            },
        ],
        [t],
    );

    const columns: ColumnDef<AdminPermissionRow>[] = [
        {
            id: 'name',
            header: t('permissions.columns.name'),
            meta: { cellClassName: 'font-mono text-sm' },
            cell: ({ row }) => row.original.name,
        },
        {
            id: 'guard',
            header: t('permissions.columns.guard'),
            meta: { cellClassName: 'text-muted-foreground' },
            cell: ({ row }) => row.original.guard_name,
        },
    ];

    const sync = (): void => {
        router.post(permissionsRoutes.sync.url(), {}, { preserveScroll: true });
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                can(PermissionEnum.CanEditPermissions) ? (
                    <HeaderIconButton
                        type="button"
                        variant="outline"
                        label={t('permissions.sync')}
                        onClick={sync}
                    >
                        <RefreshCw className="size-4" />
                    </HeaderIconButton>
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
                            synced to the database. Assign them to roles on the
                            role edit page.
                        </>
                    }
                >
                    <DataTable
                        columns={columns}
                        data={permissions.data ?? []}
                        getRowId={(permission) => String(permission.id)}
                        pagination={permissions}
                        emptyState={
                            <span className="text-muted-foreground">
                                {t('permissions.empty')}
                            </span>
                        }
                    />
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
