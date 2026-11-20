import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/admin/data-table';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { TableCellLine } from '@/components/admin/table-cell-line';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { PageLayout } from '@/components/layout/page-layout';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import connectedAppsRoutes from '@/routes/connected-apps';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';

type ConnectedApp = {
    id: number;
    name: string;
    redirectHosts: string[];
    scopes: string[];
    role: string | null;
    collectionSlugs: string[] | null;
    authorizedAt: string | null;
    lastUsedAt: string | null;
};

/**
 * Settings → Connected apps (#802): the remote MCP clients the user authorized, with what each
 * may do, and Revoke. On the pending tool calls page pattern (settings layout, data table, a
 * destructive row action behind the confirm dialog, as on the API keys page).
 */
export default function ConnectedApps({
    connectedApps,
}: {
    connectedApps: ConnectedApp[];
}) {
    const { t } = useTranslation();
    const [pendingRevokeId, setPendingRevokeId] = useState<number | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('settings.layout.title'), href: editProfile() },
        {
            title: t('settings.layout.connectedApps'),
            href: connectedAppsRoutes.index.url(),
        },
    ];

    const columns: ColumnDef<ConnectedApp>[] = [
        {
            id: 'client',
            header: t('connectedApps.columns.client'),
            meta: { cellClassName: 'max-w-56' },
            cell: ({ row }) => (
                <TableCellLine
                    primary={row.original.name}
                    secondary={row.original.redirectHosts.join(', ')}
                />
            ),
        },
        {
            id: 'access',
            header: t('connectedApps.columns.access'),
            meta: { cellClassName: 'max-w-md' },
            cell: ({ row }) => (
                <TableCellLine
                    primary={row.original.scopes.join(', ')}
                    secondary={[
                        row.original.role,
                        row.original.collectionSlugs === null
                            ? t('connectedApps.allCollections')
                            : row.original.collectionSlugs.join(', '),
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                />
            ),
        },
        {
            id: 'lastUsedAt',
            header: t('connectedApps.columns.lastUsed'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'text-right whitespace-nowrap tabular-nums',
            },
            cell: ({ row }) =>
                row.original.lastUsedAt
                    ? new Date(row.original.lastUsedAt).toLocaleString()
                    : t('connectedApps.neverUsed'),
        },
        {
            id: 'actions',
            header: t('connectedApps.columns.actions'),
            meta: {
                headerClassName: 'w-[1%] text-right',
                cellClassName: 'text-right',
            },
            cell: ({ row }) => (
                <HeaderIconButton
                    type="button"
                    variant="destructive-ghost"
                    size="icon-sm"
                    label={t('connectedApps.revoke', {
                        name: row.original.name,
                    })}
                    data-test={`connected-app-revoke-${row.original.id}`}
                    onClick={() => setPendingRevokeId(row.original.id)}
                >
                    <Trash2 className="size-3.5" />
                </HeaderIconButton>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('connectedApps.head')} />
            <SettingsLayout wide>
                <PageLayout description={t('connectedApps.description')}>
                    <DataTable
                        columns={columns}
                        data={connectedApps}
                        getRowId={(row) => String(row.id)}
                        emptyState={
                            <span className="text-muted-foreground">
                                {t('connectedApps.empty')}
                            </span>
                        }
                    />
                </PageLayout>
            </SettingsLayout>

            <ConfirmDestructiveDialog
                open={pendingRevokeId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingRevokeId(null);
                    }
                }}
                title={t('connectedApps.confirm.title', {
                    name:
                        connectedApps.find(
                            (connectedApp) =>
                                connectedApp.id === pendingRevokeId,
                        )?.name ?? '',
                })}
                description={t('connectedApps.confirm.description')}
                confirmLabel={t('connectedApps.confirm.confirm')}
                confirming={isRevoking}
                onConfirm={() => {
                    if (pendingRevokeId === null) {
                        return;
                    }

                    setIsRevoking(true);
                    router.delete(
                        connectedAppsRoutes.destroy.url(pendingRevokeId),
                        {
                            onFinish: () => setIsRevoking(false),
                            onSuccess: () => setPendingRevokeId(null),
                            onError: () => setPendingRevokeId(null),
                        },
                    );
                }}
            />
        </AppLayout>
    );
}
