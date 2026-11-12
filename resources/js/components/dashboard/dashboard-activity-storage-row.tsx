import { Deferred, Link } from '@inertiajs/react';
import { HardDrive, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { TableCellLine } from '@/components/admin/table-cell-line';
import { Button } from '@/components/ui/button';
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
import activityLogs from '@/routes/activity-logs';
import files from '@/routes/files';
import { DashboardTableSkeleton } from '@/components/dashboard/dashboard-table-skeleton';
import type {
    LargestFileItem,
    LatestActivityItem,
    StorageTrendItem,
} from '@/components/dashboard/dashboard-types';

/**
 * Overview row with the latest activity next to the largest files and the storage trend.
 * The last two are deferred props, so they show a skeleton until their data arrives.
 */
export function DashboardActivityStorageRow({
    latestActivity,
    largestFiles,
    storageTrend,
}: {
    latestActivity: LatestActivityItem[];
    largestFiles?: LargestFileItem[];
    storageTrend?: StorageTrendItem[];
}) {
    const { t } = useTranslation();
    const storageTrendRows = (storageTrend ?? []).slice(-14);

    return (
        <div className="grid grid-cols-1 gap-4 xl:h-[clamp(28rem,52vh,36rem)] xl:grid-cols-12">
            <Card className="h-full max-h-[28rem] min-h-[18rem] gap-4 xl:col-span-5 xl:max-h-none xl:min-h-0">
                <CardHeader className="shrink-0 pb-3">
                    <CardTitle>{t('dashboard.latestActivity')}</CardTitle>
                    <CardDescription>
                        {t('dashboard.latestActivityDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                    <div
                        role="region"
                        aria-label={t('dashboard.latestActivity')}
                        className="max-h-[20rem] min-h-[10rem] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1 [&_[data-slot=table-container]]:overflow-visible"
                        tabIndex={0}
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[7rem]">
                                        {t('dashboard.event')}
                                    </TableHead>
                                    <TableHead>
                                        {t('dashboard.descriptionCol')}
                                    </TableHead>
                                    <TableHead className="w-[10rem] text-right tabular-nums">
                                        {t('dashboard.when')}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="[&_td]:h-10">
                                {latestActivity.map((activity) => (
                                    <TableRow key={activity.id}>
                                        <TableCell className="text-muted-foreground">
                                            {activity.event ?? '—'}
                                        </TableCell>
                                        <TableCell className="max-w-0 min-w-0">
                                            <TableCellLine
                                                primary={
                                                    activity.description ?? '—'
                                                }
                                                secondary={
                                                    activity.causer?.label
                                                        ? t(
                                                              'dashboard.byUser',
                                                              {
                                                                  name: activity
                                                                      .causer
                                                                      .label,
                                                              },
                                                          )
                                                        : null
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                            {activity.created_at
                                                ? new Date(
                                                      activity.created_at,
                                                  ).toLocaleString()
                                                : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {latestActivity.length === 0 ? (
                                    <TableRow>
                                        <TableCell className="p-3" colSpan={3}>
                                            <PageEmptyState
                                                icon={Inbox}
                                                title={t(
                                                    'dashboard.noActivity',
                                                )}
                                                description={t(
                                                    'emptyState.dashboard.activityDescription',
                                                )}
                                                action={
                                                    <Button asChild>
                                                        <Link
                                                            href={activityLogs.index.url()}
                                                        >
                                                            {t(
                                                                'emptyState.dashboard.activityCta',
                                                            )}
                                                        </Link>
                                                    </Button>
                                                }
                                                compact
                                                className="border-0"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end">
                        <Link
                            href={activityLogs.index.url()}
                            className="text-sm underline underline-offset-4"
                        >
                            {t('dashboard.viewAll')}
                        </Link>
                    </div>
                </CardContent>
            </Card>
            <div className="grid min-h-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-7 xl:h-full xl:grid-rows-1">
                <Card className="h-full max-h-[22rem] min-h-[14rem] gap-4 xl:max-h-none xl:min-h-0">
                    <CardHeader className="shrink-0 pb-3">
                        <CardTitle>{t('dashboard.largestFiles')}</CardTitle>
                        <CardDescription>
                            {t('dashboard.largestFilesDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col">
                        <Deferred
                            data="largestFiles"
                            fallback={<DashboardTableSkeleton />}
                        >
                            <div
                                role="region"
                                aria-label={t('dashboard.largestFiles')}
                                className="max-h-[20rem] min-h-[10rem] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1"
                                tabIndex={0}
                            >
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('dashboard.file')}
                                            </TableHead>
                                            <TableHead className="w-[7rem] text-right tabular-nums">
                                                {t('dashboard.size')}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="[&_td]:h-10">
                                        {(largestFiles ?? []).map((file) => (
                                            <TableRow key={file.id}>
                                                <TableCell className="max-w-0 min-w-0">
                                                    <TableCellLine
                                                        primary={file.name}
                                                        secondary={`${file.disk} · ${file.path}`}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatBytes(file.size)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(largestFiles ?? []).length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    className="p-3"
                                                    colSpan={2}
                                                >
                                                    <PageEmptyState
                                                        icon={HardDrive}
                                                        title={t(
                                                            'dashboard.noFiles',
                                                        )}
                                                        description={t(
                                                            'emptyState.dashboard.filesDescription',
                                                        )}
                                                        action={
                                                            <Button asChild>
                                                                <Link
                                                                    href={files.index.url()}
                                                                >
                                                                    {t(
                                                                        'emptyState.dashboard.filesCta',
                                                                    )}
                                                                </Link>
                                                            </Button>
                                                        }
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
                <Card className="h-full max-h-[22rem] min-h-[14rem] gap-4 xl:max-h-none xl:min-h-0">
                    <CardHeader className="shrink-0 pb-3">
                        <CardTitle>{t('dashboard.storageTrend')}</CardTitle>
                        <CardDescription>
                            {t('dashboard.storageTrendDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col">
                        <Deferred
                            data="storageTrend"
                            fallback={<DashboardTableSkeleton />}
                        >
                            <div
                                role="region"
                                aria-label={t('dashboard.storageTrend')}
                                className="max-h-[20rem] min-h-[10rem] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1"
                                tabIndex={0}
                            >
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('dashboard.date')}
                                            </TableHead>
                                            <TableHead className="w-[8rem] text-right tabular-nums">
                                                {t('dashboard.added')}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="[&_td]:h-10">
                                        {storageTrendRows.map((row) => (
                                            <TableRow key={row.date}>
                                                <TableCell className="font-medium">
                                                    {row.date}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatBytes(
                                                        row.bytes_added,
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {storageTrendRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    className="p-3"
                                                    colSpan={2}
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
        </div>
    );
}
