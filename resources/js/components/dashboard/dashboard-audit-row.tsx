import { Deferred } from '@inertiajs/react';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { TableCellLine } from '@/components/admin/table-cell-line';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatBytes } from '@/lib/format';
import { DashboardTableSkeleton } from '@/components/dashboard/dashboard-table-skeleton';
import type {
    DiskFileStatsItem,
    MostActiveUser,
    StuckOrphanUploadItem,
    SuspiciousEventItem,
} from '@/components/dashboard/dashboard-types';

/**
 * Overview audit row: suspicious events, most active users and stuck uploads next to the
 * storage used per disk (a deferred prop with a skeleton while it loads).
 */
export function DashboardAuditRow({
    suspiciousEvents,
    mostActiveUsers,
    stuckOrphanUploads,
    fileStatsByDisk,
}: {
    suspiciousEvents: SuspiciousEventItem[];
    mostActiveUsers: MostActiveUser[];
    stuckOrphanUploads: StuckOrphanUploadItem[];
    fileStatsByDisk?: DiskFileStatsItem[];
}) {
    const { t } = useTranslation();
    const fileStatsByDiskRows = (fileStatsByDisk ?? []).slice(0, 8);

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="flex flex-col gap-4 xl:col-span-5">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>{t('dashboard.suspicious')}</CardTitle>
                        <CardDescription>
                            {t('dashboard.suspiciousDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            {t('dashboard.descriptionCol')}
                                        </TableHead>
                                        <TableHead className="w-[10rem] text-right tabular-nums">
                                            {t('dashboard.when')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="[&_td]:h-10">
                                    {suspiciousEvents.map((event) => (
                                        <TableRow key={event.id}>
                                            <TableCell className="max-w-0 min-w-0">
                                                <TableCellLine
                                                    primary={
                                                        event.description ?? '—'
                                                    }
                                                    secondary={
                                                        event.causer?.label
                                                            ? t(
                                                                  'dashboard.byUser',
                                                                  {
                                                                      name: event
                                                                          .causer
                                                                          .label,
                                                                  },
                                                              )
                                                            : null
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                                {event.created_at
                                                    ? new Date(
                                                          event.created_at,
                                                      ).toLocaleString()
                                                    : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {suspiciousEvents.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                className="p-3"
                                                colSpan={2}
                                            >
                                                <PageEmptyState
                                                    icon={Inbox}
                                                    title={t(
                                                        'dashboard.noSuspicious',
                                                    )}
                                                    description={t(
                                                        'emptyState.dashboard.genericDescription',
                                                    )}
                                                    compact
                                                    className="border-0"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>{t('dashboard.mostActive')}</CardTitle>
                            <CardDescription>
                                {t('dashboard.mostActiveDesc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('dashboard.user')}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right tabular-nums">
                                                {t('dashboard.events')}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="[&_td]:h-10">
                                        {mostActiveUsers.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell className="font-medium">
                                                    {user.label}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {user.activity_count.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {mostActiveUsers.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    className="p-3"
                                                    colSpan={2}
                                                >
                                                    <PageEmptyState
                                                        icon={Inbox}
                                                        title={t(
                                                            'dashboard.noActivity',
                                                        )}
                                                        description={t(
                                                            'emptyState.dashboard.genericDescription',
                                                        )}
                                                        compact
                                                        className="border-0"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ) : null}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle>{t('dashboard.stuckUploads')}</CardTitle>
                            <CardDescription>
                                {t('dashboard.stuckUploadsDesc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('dashboard.upload')}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right tabular-nums">
                                                {t('dashboard.chunks')}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="[&_td]:h-10">
                                        {stuckOrphanUploads.map((upload) => (
                                            <TableRow key={upload.id}>
                                                <TableCell className="max-w-0 min-w-0">
                                                    <TableCellLine
                                                        primary={
                                                            upload.file_name
                                                        }
                                                        secondary={`${upload.disk} · ${upload.parent_id ? t('dashboard.parentId', { id: upload.parent_id }) : t('dashboard.noParent')}`}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                                    {upload.uploaded_chunks.toLocaleString()}
                                                    /
                                                    {upload.total_chunks.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {stuckOrphanUploads.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    className="p-3"
                                                    colSpan={2}
                                                >
                                                    <PageEmptyState
                                                        icon={Inbox}
                                                        title={t(
                                                            'dashboard.noStuckUploads',
                                                        )}
                                                        description={t(
                                                            'emptyState.dashboard.genericDescription',
                                                        )}
                                                        compact
                                                        className="border-0"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ) : null}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            <Card className="xl:col-span-7">
                <CardHeader className="pb-3">
                    <CardTitle>{t('dashboard.storageByDisk')}</CardTitle>
                    <CardDescription>
                        {t('dashboard.storageByDiskDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Deferred
                        data="fileStatsByDisk"
                        fallback={<DashboardTableSkeleton />}
                    >
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            {t('dashboard.disk')}
                                        </TableHead>
                                        <TableHead className="text-right tabular-nums">
                                            {t('dashboard.files')}
                                        </TableHead>
                                        <TableHead className="text-right tabular-nums">
                                            {t('dashboard.size')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="[&_td]:h-10">
                                    {fileStatsByDiskRows.map((row) => (
                                        <TableRow key={row.disk}>
                                            <TableCell className="font-medium">
                                                {row.disk}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.files_count.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatBytes(
                                                    row.files_size_sum,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {fileStatsByDiskRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                className="p-3"
                                                colSpan={3}
                                            >
                                                <PageEmptyState
                                                    icon={Inbox}
                                                    title={t(
                                                        'dashboard.noData',
                                                    )}
                                                    description={t(
                                                        'emptyState.dashboard.genericDescription',
                                                    )}
                                                    compact
                                                    className="border-0"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                    </Deferred>
                </CardContent>
            </Card>
        </div>
    );
}
