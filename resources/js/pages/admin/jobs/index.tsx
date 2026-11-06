import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/admin/data-table';
import { TruncatedText } from '@/components/admin/truncated-text';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editProfile } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';

type PendingJob = {
    id: number;
    queue: string;
    display_name: string;
    attempts: number;
    available_at: number;
    created_at: number;
};

type FailedJob = {
    id: number;
    uuid: string;
    queue: string;
    display_name: string;
    exception: string;
    failed_at: string;
};

/**
 * Queue monitor: pending sample + failed jobs with retry/delete.
 */
export default function JobsIndex({
    pending_count,
    pending,
    failed,
    can_manage,
}: {
    pending_count: number;
    pending: PendingJob[];
    failed: FailedJob[];
    can_manage: boolean;
}) {
    const { t } = useTranslation();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('settings.layout.title'), href: editProfile() },
        { title: t('jobs.title'), href: '/settings/jobs' },
    ];

    const pendingColumns: ColumnDef<PendingJob>[] = [
        {
            id: 'id',
            header: t('jobs.columns.id'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'text-right tabular-nums',
            },
            cell: ({ row }) => row.original.id,
        },
        {
            id: 'job',
            header: t('jobs.columns.job'),
            meta: { cellClassName: 'max-w-[14rem] font-mono text-xs' },
            cell: ({ row }) => (
                <TruncatedText text={row.original.display_name} />
            ),
        },
        {
            id: 'queue',
            header: t('jobs.columns.queue'),
            cell: ({ row }) => row.original.queue,
        },
        {
            id: 'attempts',
            header: t('jobs.columns.attempts'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'text-right tabular-nums',
            },
            cell: ({ row }) => row.original.attempts,
        },
    ];

    const failedColumns: ColumnDef<FailedJob>[] = [
        {
            id: 'job',
            header: t('jobs.columns.job'),
            meta: { cellClassName: 'max-w-[14rem] font-mono text-xs' },
            cell: ({ row }) => (
                <TruncatedText text={row.original.display_name} />
            ),
        },
        {
            id: 'queue',
            header: t('jobs.columns.queue'),
            cell: ({ row }) => row.original.queue,
        },
        {
            id: 'failed_at',
            header: t('jobs.columns.failedAt'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'text-right whitespace-nowrap tabular-nums',
            },
            cell: ({ row }) => row.original.failed_at,
        },
        {
            id: 'exception',
            header: t('jobs.columns.exception'),
            meta: {
                cellClassName:
                    'max-w-md font-mono text-xs text-muted-foreground',
            },
            cell: ({ row }) => <TruncatedText text={row.original.exception} />,
        },
        {
            id: 'actions',
            header: t('jobs.columns.actions'),
            meta: {
                headerClassName: 'text-right',
                cellClassName: 'space-x-2 text-right whitespace-nowrap',
            },
            cell: ({ row }) =>
                can_manage ? (
                    <>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                router.post(
                                    `/settings/jobs/${row.original.uuid}/retry`,
                                )
                            }
                        >
                            {t('jobs.retry')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                                router.delete(
                                    `/settings/jobs/${row.original.uuid}`,
                                )
                            }
                        >
                            {t('common.delete')}
                        </Button>
                    </>
                ) : null,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('jobs.title')} />
            <SettingsLayout wide>
                <PageLayout
                    description={t('jobs.pendingCount', {
                        count: pending_count,
                    })}
                >
                    <div className="mb-8 space-y-3">
                        <h2 className="text-lg font-medium">
                            {t('jobs.pendingTitle')}
                        </h2>
                        <DataTable
                            columns={pendingColumns}
                            data={pending}
                            getRowId={(job) => String(job.id)}
                            emptyState={
                                <span className="text-muted-foreground">
                                    {t('jobs.pendingEmpty')}
                                </span>
                            }
                        />
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-lg font-medium">
                            {t('jobs.failedTitle')}
                        </h2>
                        <DataTable
                            columns={failedColumns}
                            data={failed}
                            getRowId={(job) => job.uuid}
                            getRowProps={() => ({ className: 'align-top' })}
                            emptyState={
                                <span className="text-muted-foreground">
                                    {t('jobs.failedEmpty')}
                                </span>
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('jobs.scopeHint')}
                        </p>
                    </div>
                </PageLayout>
            </SettingsLayout>
        </AppLayout>
    );
}
