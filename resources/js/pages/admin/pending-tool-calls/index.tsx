import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/admin/data-table';
import { TruncatedText } from '@/components/admin/truncated-text';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';

type PendingRow = {
    id: number;
    uuid: string;
    tool: string;
    surface: string;
    arguments: Record<string, unknown>;
    expires_at: string | null;
    created_at: string | null;
    requester: { id: number; name: string; email: string } | null;
};

/**
 * MCP AI tool calls waiting for human approval.
 */
export default function PendingToolCallsIndex({
    pending,
}: {
    pending: PendingRow[];
}) {
    const { t } = useTranslation();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('settings.layout.title'), href: editProfile() },
        {
            title: t('settings.layout.pendingToolCalls'),
            href: '/settings/pending-tool-calls',
        },
    ];

    const columns: ColumnDef<PendingRow>[] = [
        {
            id: 'tool',
            header: t('pendingToolCalls.colTool'),
            meta: { cellClassName: 'font-medium' },
            cell: ({ row }) => (
                <>
                    {row.original.tool}
                    <div className="text-xs text-muted-foreground">
                        {row.original.surface}
                    </div>
                </>
            ),
        },
        {
            id: 'arguments',
            header: t('pendingToolCalls.colArgs'),
            meta: {
                cellClassName:
                    'max-w-md font-mono text-xs text-muted-foreground',
            },
            cell: ({ row }) => (
                <TruncatedText
                    text={JSON.stringify(row.original.arguments ?? {})}
                />
            ),
        },
        {
            id: 'requester',
            header: t('pendingToolCalls.colRequester'),
            cell: ({ row }) => row.original.requester?.name ?? '—',
        },
        {
            id: 'expires_at',
            header: t('pendingToolCalls.colExpires'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'text-right whitespace-nowrap tabular-nums',
            },
            cell: ({ row }) => row.original.expires_at ?? '—',
        },
        {
            id: 'actions',
            header: t('pendingToolCalls.colActions'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'text-right whitespace-nowrap',
            },
            cell: ({ row }) => (
                <ButtonGroup
                    aria-label={t('pendingToolCalls.colActions')}
                    className="ml-auto"
                >
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive-outline"
                        onClick={() =>
                            router.post(
                                `/settings/pending-tool-calls/${row.original.id}/approve`,
                            )
                        }
                    >
                        {t('pendingToolCalls.approve')}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            router.post(
                                `/settings/pending-tool-calls/${row.original.id}/reject`,
                            )
                        }
                    >
                        {t('pendingToolCalls.reject')}
                    </Button>
                </ButtonGroup>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('pendingToolCalls.head')} />
            <SettingsLayout wide>
                <PageLayout description={t('pendingToolCalls.description')}>
                    <DataTable
                        columns={columns}
                        data={pending}
                        getRowId={(row) => row.uuid}
                        getRowProps={() => ({ className: 'align-top' })}
                        emptyState={
                            <span className="text-muted-foreground">
                                {t('pendingToolCalls.empty')}
                            </span>
                        }
                    />
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
