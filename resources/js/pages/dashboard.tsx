import { Deferred, Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { PageLayout } from '@/components/layout/page-layout';
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
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import type { BreadcrumbItem } from '@/types';

type LatestActivityItem = {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string;
    created_at: string | null;
    causer: { id: number; label: string } | null;
    subject: { type: string | null; id: number; label: string } | null;
};

type MostActiveUser = {
    id: number;
    label: string;
    activity_count: number;
};

type SuspiciousEventItem = {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string;
    created_at: string | null;
    causer: { id: number; label: string } | null;
};

type StuckOrphanUploadItem = {
    id: number;
    upload_id: string;
    file_name: string;
    disk: string;
    parent_id: number | null;
    total_size: number;
    uploaded_chunks: number;
    total_chunks: number;
    expires_at: string | null;
    created_at: string | null;
};

type LargestFileItem = {
    id: number;
    name: string;
    path: string;
    disk: string;
    size: number;
    created_at: string | null;
};

type StorageTrendItem = {
    date: string;
    bytes_added: number;
};

type CollectionCountItem = {
    id: number;
    name: string;
    slug: string;
    items_count: number;
};

type ActivityOverTimeItem = {
    date: string;
    count: number;
};

type ContentEventBreakdown = {
    created: number;
    updated: number;
    deleted: number;
};

type HorizonWorkload = {
    name: string;
    length: number;
    wait: number;
    processes: number;
};

type HorizonMetrics = {
    available: boolean;
    status: string;
    masters: number;
    processes: number;
    pending: number;
    failed: number;
    jobs_per_minute: number | null;
    throughput: number | null;
    workloads: HorizonWorkload[];
};

type HealthMetrics = {
    queue_connection: string;
    broadcast_connection: string;
    pulse_enabled: boolean;
    pulse_ingest: string;
    pulse_available: boolean;
    redis_ok: boolean;
    failed_jobs: number;
    pending_jobs: number;
    exceptions_24h: number;
    slow_jobs_24h: number;
    slow_queries_24h: number;
    horizon: HorizonMetrics;
};

type DashboardProps = {
    latestActivity: LatestActivityItem[];
    fileStats: {
        files_count: number;
        folders_count: number;
        files_size_sum: number;
    };
    uploadHealth: { in_progress_count: number; stale_count: number };
    mostActiveUsers: MostActiveUser[];
    suspiciousEvents: SuspiciousEventItem[];
    stuckOrphanUploads: StuckOrphanUploadItem[];
    largestFiles?: LargestFileItem[];
    fileStatsByDisk?: {
        disk: string;
        files_count: number;
        files_size_sum: number;
    }[];
    storageTrend?: StorageTrendItem[];
    collectionCounts?: CollectionCountItem[];
    activityOverTime?: ActivityOverTimeItem[];
    contentEventBreakdown?: ContentEventBreakdown;
    health?: HealthMetrics;
};

type DashboardTab = 'overview' | 'health';

/**
 * Formats a byte count using binary units (B through TB).
 * @param {number} bytes - Raw byte count.
 * @returns {string} Human-readable size string.
 */
function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value = value / 1024;
        unitIndex += 1;
    }

    const rounded = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);

    return `${rounded} ${units[unitIndex]}`;
}

/**
 * Main dashboard with activity, storage, and upload health widgets.
 * @returns {JSX.Element}
 */
export default function Dashboard({
    latestActivity,
    fileStats,
    uploadHealth,
    mostActiveUsers,
    suspiciousEvents,
    stuckOrphanUploads,
    largestFiles,
    fileStatsByDisk,
    storageTrend,
    collectionCounts = [],
    activityOverTime = [],
    contentEventBreakdown = { created: 0, updated: 0, deleted: 0 },
    health,
}: DashboardProps) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<DashboardTab>('overview');
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('dashboard.title'),
            href: dashboard(),
        },
    ];
    const storageTrendRows = (storageTrend ?? []).slice(-14);
    const fileStatsByDiskRows = (fileStatsByDisk ?? []).slice(0, 8);
    const activityLast7 = activityOverTime.slice(-7);
    const eventBreakdownChart = [
        { event: t('dashboard.created'), count: contentEventBreakdown.created },
        { event: t('dashboard.updated'), count: contentEventBreakdown.updated },
        { event: t('dashboard.deleted'), count: contentEventBreakdown.deleted },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('dashboard.title')} />
            <PageLayout
                scrollContent
                subheader={
                    <nav
                        className="inline-flex items-center gap-3 text-sm"
                        data-test="dashboard-tabs"
                        aria-label={t('dashboard.tabsLabel')}
                    >
                        {(['overview', 'health'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setTab(value)}
                                className={cn(
                                    'border-b-2 pb-0.5 transition-colors',
                                    tab === value
                                        ? 'border-foreground font-medium text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground',
                                )}
                                data-test={`dashboard-tab-${value}`}
                                aria-current={
                                    tab === value ? 'page' : undefined
                                }
                            >
                                {value === 'overview'
                                    ? t('dashboard.tabOverview')
                                    : t('dashboard.tabHealth')}
                            </button>
                        ))}
                    </nav>
                }
            >
                {tab === 'health' ? (
                    <DashboardHealthPanel health={health} />
                ) : (
                    <div className="flex flex-col gap-4">
                        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                            <Card className="xl:col-span-4">
                                <CardHeader className="pb-3">
                                    <CardTitle>
                                        {t('dashboard.insightsCollections')}
                                    </CardTitle>
                                    <CardDescription>
                                        {t('dashboard.insightsCollectionsDesc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="max-h-64 overflow-auto rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>
                                                        {t(
                                                            'dashboard.collection',
                                                        )}
                                                    </TableHead>
                                                    <TableHead className="w-[6rem] text-right">
                                                        {t('dashboard.items')}
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {collectionCounts.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell className="min-w-0">
                                                            <div className="truncate font-medium">
                                                                {row.name}
                                                            </div>
                                                            <div className="truncate text-xs text-muted-foreground">
                                                                {row.slug}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {row.items_count.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {collectionCounts.length ===
                                                0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            className="py-6 text-center text-muted-foreground"
                                                            colSpan={2}
                                                        >
                                                            {t(
                                                                'dashboard.noCollections',
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ) : null}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-5">
                                <CardHeader className="pb-3">
                                    <CardTitle>
                                        {t('dashboard.insightsActivity')}
                                    </CardTitle>
                                    <CardDescription>
                                        {t('dashboard.insightsActivityDesc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-56 w-full">
                                        {activityLast7.every(
                                            (row) => row.count === 0,
                                        ) ? (
                                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                                {t('dashboard.noActivity7d')}
                                            </div>
                                        ) : (
                                            <ResponsiveContainer
                                                width="100%"
                                                height="100%"
                                            >
                                                <BarChart data={activityLast7}>
                                                    <CartesianGrid
                                                        strokeDasharray="3 3"
                                                        vertical={false}
                                                    />
                                                    <XAxis
                                                        dataKey="date"
                                                        tick={{ fontSize: 11 }}
                                                        tickFormatter={(
                                                            value: string,
                                                        ) => value.slice(5)}
                                                    />
                                                    <YAxis
                                                        allowDecimals={false}
                                                        tick={{ fontSize: 11 }}
                                                        width={32}
                                                    />
                                                    <Tooltip />
                                                    <Bar
                                                        dataKey="count"
                                                        fill="var(--color-primary)"
                                                        radius={[4, 4, 0, 0]}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-3">
                                <CardHeader className="pb-3">
                                    <CardTitle>
                                        {t('dashboard.contentEvents')}
                                    </CardTitle>
                                    <CardDescription>
                                        {t('dashboard.contentEventsDesc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-56 w-full">
                                        {eventBreakdownChart.every(
                                            (row) => row.count === 0,
                                        ) ? (
                                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                                {t('dashboard.noContentEvents')}
                                            </div>
                                        ) : (
                                            <ResponsiveContainer
                                                width="100%"
                                                height="100%"
                                            >
                                                <BarChart
                                                    data={eventBreakdownChart}
                                                >
                                                    <CartesianGrid
                                                        strokeDasharray="3 3"
                                                        vertical={false}
                                                    />
                                                    <XAxis
                                                        dataKey="event"
                                                        tick={{ fontSize: 11 }}
                                                    />
                                                    <YAxis
                                                        allowDecimals={false}
                                                        tick={{ fontSize: 11 }}
                                                        width={32}
                                                    />
                                                    <Tooltip />
                                                    <Bar
                                                        dataKey="count"
                                                        fill="var(--color-chart-2, var(--color-primary))"
                                                        radius={[4, 4, 0, 0]}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
                            <div className="grid grid-cols-1 gap-4 xl:col-span-5">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle>
                                            {t('dashboard.latestActivity')}
                                        </CardTitle>
                                        <CardDescription>
                                            {t('dashboard.latestActivityDesc')}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-3">
                                        <div className="overflow-x-auto rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-[7rem]">
                                                            {t(
                                                                'dashboard.event',
                                                            )}
                                                        </TableHead>
                                                        <TableHead>
                                                            {t(
                                                                'dashboard.descriptionCol',
                                                            )}
                                                        </TableHead>
                                                        <TableHead className="w-[10rem] text-right">
                                                            {t(
                                                                'dashboard.when',
                                                            )}
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {latestActivity.map(
                                                        (activity) => (
                                                            <TableRow
                                                                key={
                                                                    activity.id
                                                                }
                                                            >
                                                                <TableCell className="text-muted-foreground">
                                                                    {activity.event ??
                                                                        '—'}
                                                                </TableCell>
                                                                <TableCell className="min-w-0">
                                                                    <div className="truncate font-medium">
                                                                        {
                                                                            activity.description
                                                                        }
                                                                    </div>
                                                                    <div className="truncate text-xs text-muted-foreground">
                                                                        {activity
                                                                            .causer
                                                                            ?.label
                                                                            ? t(
                                                                                  'dashboard.byUser',
                                                                                  {
                                                                                      name: activity
                                                                                          .causer
                                                                                          .label,
                                                                                  },
                                                                              )
                                                                            : '—'}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right text-xs text-muted-foreground">
                                                                    {activity.created_at
                                                                        ? new Date(
                                                                              activity.created_at,
                                                                          ).toLocaleString()
                                                                        : '—'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ),
                                                    )}
                                                    {latestActivity.length ===
                                                    0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                className="py-6 text-center text-muted-foreground"
                                                                colSpan={3}
                                                            >
                                                                {t(
                                                                    'dashboard.noActivity',
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : null}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        <div className="flex justify-end">
                                            <Link
                                                href={adminRoutes.activityLogs.index()}
                                                className="text-sm underline underline-offset-4"
                                            >
                                                {t('dashboard.viewAll')}
                                            </Link>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle>
                                            {t('dashboard.suspicious')}
                                        </CardTitle>
                                        <CardDescription>
                                            {t('dashboard.suspiciousDesc')}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="overflow-x-auto rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>
                                                            {t(
                                                                'dashboard.descriptionCol',
                                                            )}
                                                        </TableHead>
                                                        <TableHead className="w-[10rem] text-right">
                                                            {t(
                                                                'dashboard.when',
                                                            )}
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {suspiciousEvents.map(
                                                        (event) => (
                                                            <TableRow
                                                                key={event.id}
                                                            >
                                                                <TableCell className="min-w-0">
                                                                    <div className="truncate font-medium">
                                                                        {
                                                                            event.description
                                                                        }
                                                                    </div>
                                                                    <div className="truncate text-xs text-muted-foreground">
                                                                        {event
                                                                            .causer
                                                                            ?.label
                                                                            ? t(
                                                                                  'dashboard.byUser',
                                                                                  {
                                                                                      name: event
                                                                                          .causer
                                                                                          .label,
                                                                                  },
                                                                              )
                                                                            : '—'}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right text-xs text-muted-foreground">
                                                                    {event.created_at
                                                                        ? new Date(
                                                                              event.created_at,
                                                                          ).toLocaleString()
                                                                        : '—'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ),
                                                    )}
                                                    {suspiciousEvents.length ===
                                                    0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                className="py-6 text-center text-muted-foreground"
                                                                colSpan={2}
                                                            >
                                                                {t(
                                                                    'dashboard.noSuspicious',
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : null}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle>
                                                {t('dashboard.mostActive')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t('dashboard.mostActiveDesc')}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="overflow-x-auto rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                {t(
                                                                    'dashboard.user',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="w-[6rem] text-right">
                                                                {t(
                                                                    'dashboard.events',
                                                                )}
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {mostActiveUsers.map(
                                                            (user) => (
                                                                <TableRow
                                                                    key={
                                                                        user.id
                                                                    }
                                                                >
                                                                    <TableCell className="font-medium">
                                                                        {
                                                                            user.label
                                                                        }
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {user.activity_count.toLocaleString()}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )}
                                                        {mostActiveUsers.length ===
                                                        0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="py-6 text-center text-muted-foreground"
                                                                    colSpan={2}
                                                                >
                                                                    {t(
                                                                        'dashboard.noActivity',
                                                                    )}
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
                                            <CardTitle>
                                                {t('dashboard.stuckUploads')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.stuckUploadsDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="overflow-x-auto rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                {t(
                                                                    'dashboard.upload',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="w-[6rem] text-right">
                                                                {t(
                                                                    'dashboard.chunks',
                                                                )}
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {stuckOrphanUploads.map(
                                                            (upload) => (
                                                                <TableRow
                                                                    key={
                                                                        upload.id
                                                                    }
                                                                >
                                                                    <TableCell className="min-w-0">
                                                                        <div className="truncate font-medium">
                                                                            {
                                                                                upload.file_name
                                                                            }
                                                                        </div>
                                                                        <div className="truncate text-xs text-muted-foreground">
                                                                            {
                                                                                upload.disk
                                                                            }{' '}
                                                                            ·{' '}
                                                                            {upload.parent_id
                                                                                ? t(
                                                                                      'dashboard.parentId',
                                                                                      {
                                                                                          id: upload.parent_id,
                                                                                      },
                                                                                  )
                                                                                : t(
                                                                                      'dashboard.noParent',
                                                                                  )}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right text-xs text-muted-foreground">
                                                                        {upload.uploaded_chunks.toLocaleString()}
                                                                        /
                                                                        {upload.total_chunks.toLocaleString()}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )}
                                                        {stuckOrphanUploads.length ===
                                                        0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="py-6 text-center text-muted-foreground"
                                                                    colSpan={2}
                                                                >
                                                                    {t(
                                                                        'dashboard.noStuckUploads',
                                                                    )}
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

                            <div className="flex flex-col gap-4 xl:col-span-7">
                                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle>
                                                {t('dashboard.storageOverview')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.storageOverviewDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-3 gap-3">
                                            <div>
                                                <div className="text-xs text-muted-foreground">
                                                    {t('dashboard.files')}
                                                </div>
                                                <div className="text-2xl font-semibold">
                                                    {fileStats.files_count.toLocaleString()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">
                                                    {t('dashboard.folders')}
                                                </div>
                                                <div className="text-2xl font-semibold">
                                                    {fileStats.folders_count.toLocaleString()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">
                                                    {t('dashboard.totalSize')}
                                                </div>
                                                <div className="text-2xl font-semibold">
                                                    {formatBytes(
                                                        fileStats.files_size_sum,
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle>
                                                {t('dashboard.uploadHealth')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.uploadHealthDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="text-xs text-muted-foreground">
                                                    {t('dashboard.inProgress')}
                                                </div>
                                                <div className="text-2xl font-semibold">
                                                    {uploadHealth.in_progress_count.toLocaleString()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">
                                                    {t('dashboard.stale')}
                                                </div>
                                                <div
                                                    className={
                                                        uploadHealth.stale_count >
                                                        0
                                                            ? 'text-2xl font-semibold text-destructive'
                                                            : 'text-2xl font-semibold'
                                                    }
                                                >
                                                    {uploadHealth.stale_count.toLocaleString()}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle>
                                                {t('dashboard.largestFiles')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.largestFilesDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <Deferred
                                                data="largestFiles"
                                                fallback={
                                                    <div className="text-sm text-muted-foreground">
                                                        {t('dashboard.loading')}
                                                    </div>
                                                }
                                            >
                                                <div className="overflow-x-auto rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>
                                                                    {t(
                                                                        'dashboard.file',
                                                                    )}
                                                                </TableHead>
                                                                <TableHead className="w-[7rem] text-right">
                                                                    {t(
                                                                        'dashboard.size',
                                                                    )}
                                                                </TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {(
                                                                largestFiles ??
                                                                []
                                                            ).map((file) => (
                                                                <TableRow
                                                                    key={
                                                                        file.id
                                                                    }
                                                                >
                                                                    <TableCell className="min-w-0">
                                                                        <div className="truncate font-medium">
                                                                            {
                                                                                file.name
                                                                            }
                                                                        </div>
                                                                        <div className="truncate text-xs text-muted-foreground">
                                                                            {
                                                                                file.disk
                                                                            }{' '}
                                                                            ·{' '}
                                                                            {
                                                                                file.path
                                                                            }
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {formatBytes(
                                                                            file.size,
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                            {(
                                                                largestFiles ??
                                                                []
                                                            ).length === 0 ? (
                                                                <TableRow>
                                                                    <TableCell
                                                                        className="py-6 text-center text-muted-foreground"
                                                                        colSpan={
                                                                            2
                                                                        }
                                                                    >
                                                                        {t(
                                                                            'dashboard.noFiles',
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ) : null}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </Deferred>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle>
                                                {t('dashboard.storageTrend')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.storageTrendDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <Deferred
                                                data="storageTrend"
                                                fallback={
                                                    <div className="text-sm text-muted-foreground">
                                                        {t('dashboard.loading')}
                                                    </div>
                                                }
                                            >
                                                <div className="overflow-x-auto rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>
                                                                    {t(
                                                                        'dashboard.date',
                                                                    )}
                                                                </TableHead>
                                                                <TableHead className="w-[8rem] text-right">
                                                                    {t(
                                                                        'dashboard.added',
                                                                    )}
                                                                </TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {storageTrendRows.map(
                                                                (row) => (
                                                                    <TableRow
                                                                        key={
                                                                            row.date
                                                                        }
                                                                    >
                                                                        <TableCell className="font-medium">
                                                                            {
                                                                                row.date
                                                                            }
                                                                        </TableCell>
                                                                        <TableCell className="text-right">
                                                                            {formatBytes(
                                                                                row.bytes_added,
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ),
                                                            )}
                                                            {storageTrendRows.length ===
                                                            0 ? (
                                                                <TableRow>
                                                                    <TableCell
                                                                        className="py-6 text-center text-muted-foreground"
                                                                        colSpan={
                                                                            2
                                                                        }
                                                                    >
                                                                        {t(
                                                                            'dashboard.noData',
                                                                        )}
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

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle>
                                            {t('dashboard.storageByDisk')}
                                        </CardTitle>
                                        <CardDescription>
                                            {t('dashboard.storageByDiskDesc')}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Deferred
                                            data="fileStatsByDisk"
                                            fallback={
                                                <div className="text-sm text-muted-foreground">
                                                    {t('dashboard.loading')}
                                                </div>
                                            }
                                        >
                                            <div className="overflow-x-auto rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                {t(
                                                                    'dashboard.disk',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="text-right">
                                                                {t(
                                                                    'dashboard.files',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="text-right">
                                                                {t(
                                                                    'dashboard.size',
                                                                )}
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {fileStatsByDiskRows.map(
                                                            (row) => (
                                                                <TableRow
                                                                    key={
                                                                        row.disk
                                                                    }
                                                                >
                                                                    <TableCell className="font-medium">
                                                                        {
                                                                            row.disk
                                                                        }
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {row.files_count.toLocaleString()}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        {formatBytes(
                                                                            row.files_size_sum,
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ),
                                                        )}
                                                        {fileStatsByDiskRows.length ===
                                                        0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="py-6 text-center text-muted-foreground"
                                                                    colSpan={3}
                                                                >
                                                                    {t(
                                                                        'dashboard.noData',
                                                                    )}
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
                    </div>
                )}
            </PageLayout>
        </AppLayout>
    );
}

function MetricCard({
    label,
    value,
    tone = 'default',
}: {
    label: string;
    value: string;
    tone?: 'default' | 'danger' | 'ok';
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle
                    className={cn(
                        'text-xl',
                        tone === 'danger' && 'text-destructive',
                        tone === 'ok' &&
                            'text-emerald-600 dark:text-emerald-400',
                    )}
                >
                    {value}
                </CardTitle>
            </CardHeader>
        </Card>
    );
}

function DashboardHealthPanel({ health }: { health?: HealthMetrics }) {
    const { t } = useTranslation();

    if (!health) {
        return (
            <div
                className="text-sm text-muted-foreground"
                data-test="dashboard-health"
            >
                {t('dashboard.healthUnavailable')}
            </div>
        );
    }

    const horizon = health.horizon;
    const pulseQuiet =
        health.exceptions_24h === 0 &&
        health.slow_jobs_24h === 0 &&
        health.slow_queries_24h === 0;
    const pulseChart = [
        {
            metric: t('dashboard.healthExceptions'),
            count: health.exceptions_24h,
        },
        { metric: t('dashboard.healthSlowJobs'), count: health.slow_jobs_24h },
        {
            metric: t('dashboard.healthSlowQueries'),
            count: health.slow_queries_24h,
        },
    ];

    return (
        <div className="flex flex-col gap-4" data-test="dashboard-health">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label={t('dashboard.healthQueue')}
                    value={health.queue_connection}
                />
                <MetricCard
                    label={t('dashboard.healthBroadcast')}
                    value={health.broadcast_connection}
                />
                <MetricCard
                    label={t('dashboard.healthRedis')}
                    value={
                        health.redis_ok
                            ? t('dashboard.healthOk')
                            : t('dashboard.healthDown')
                    }
                    tone={health.redis_ok ? 'ok' : 'danger'}
                />
                <MetricCard
                    label={t('dashboard.healthPendingJobs')}
                    value={health.pending_jobs.toLocaleString()}
                />
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <Card className="xl:col-span-5">
                    <CardHeader className="pb-3">
                        <CardTitle>{t('dashboard.healthPulseTitle')}</CardTitle>
                        <CardDescription>
                            {health.pulse_enabled
                                ? t('dashboard.healthPulseDesc', {
                                      ingest: health.pulse_ingest,
                                  })
                                : t('dashboard.healthPulseOff')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!health.pulse_available ? (
                            <p className="text-sm text-muted-foreground">
                                {t('dashboard.healthPulseEmpty')}
                            </p>
                        ) : (
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthExceptions')}
                                    </div>
                                    <div
                                        className={cn(
                                            'text-2xl font-semibold',
                                            health.exceptions_24h > 0 &&
                                                'text-destructive',
                                        )}
                                    >
                                        {health.exceptions_24h.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthSlowJobs')}
                                    </div>
                                    <div className="text-2xl font-semibold">
                                        {health.slow_jobs_24h.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthSlowQueries')}
                                    </div>
                                    <div className="text-2xl font-semibold">
                                        {health.slow_queries_24h.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="xl:col-span-7">
                    <CardHeader className="pb-3">
                        <CardTitle>
                            {t('dashboard.healthPulseChartTitle')}
                        </CardTitle>
                        <CardDescription>
                            {t('dashboard.healthPulseChartDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-44 w-full">
                            {!health.pulse_available || pulseQuiet ? (
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    {t('dashboard.healthPulseQuiet')}
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={pulseChart}>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                        />
                                        <XAxis
                                            dataKey="metric"
                                            tick={{ fontSize: 11 }}
                                        />
                                        <YAxis
                                            allowDecimals={false}
                                            tick={{ fontSize: 11 }}
                                            width={32}
                                        />
                                        <Tooltip />
                                        <Bar
                                            dataKey="count"
                                            fill="var(--color-primary)"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <Card className="xl:col-span-5">
                    <CardHeader className="pb-3">
                        <CardTitle>
                            {t('dashboard.healthHorizonTitle')}
                        </CardTitle>
                        <CardDescription>
                            {horizon.available
                                ? t('dashboard.healthHorizonDesc')
                                : t('dashboard.healthHorizonUnavailable')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!horizon.available ? (
                            <p className="text-sm text-muted-foreground">
                                {t('dashboard.healthHorizonEmpty')}
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthHorizonStatus')}
                                    </div>
                                    <div
                                        className={cn(
                                            'text-2xl font-semibold',
                                            horizon.status === 'running'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-destructive',
                                        )}
                                    >
                                        {horizon.status === 'running'
                                            ? t(
                                                  'dashboard.healthHorizonRunning',
                                              )
                                            : t(
                                                  'dashboard.healthHorizonStopped',
                                              )}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthHorizonPending')}
                                    </div>
                                    <div className="text-2xl font-semibold">
                                        {horizon.pending.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthHorizonFailed')}
                                    </div>
                                    <div
                                        className={cn(
                                            'text-2xl font-semibold',
                                            horizon.failed > 0 &&
                                                'text-destructive',
                                        )}
                                    >
                                        {horizon.failed.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthHorizonProcesses')}
                                    </div>
                                    <div className="text-2xl font-semibold">
                                        {horizon.processes.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthHorizonThroughput')}
                                    </div>
                                    <div className="text-2xl font-semibold">
                                        {(
                                            horizon.jobs_per_minute ?? 0
                                        ).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('dashboard.healthFailedJobs')}
                                    </div>
                                    <div
                                        className={cn(
                                            'text-2xl font-semibold',
                                            health.failed_jobs > 0 &&
                                                'text-destructive',
                                        )}
                                    >
                                        {health.failed_jobs.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="xl:col-span-7">
                    <CardHeader className="pb-3">
                        <CardTitle>
                            {t('dashboard.healthWorkloadsTitle')}
                        </CardTitle>
                        <CardDescription>
                            {t('dashboard.healthWorkloadsDesc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!horizon.available ||
                        horizon.workloads.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {t('dashboard.healthWorkloadsEmpty')}
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t(
                                                    'dashboard.healthWorkloadQueue',
                                                )}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right">
                                                {t(
                                                    'dashboard.healthWorkloadLength',
                                                )}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right">
                                                {t(
                                                    'dashboard.healthWorkloadWait',
                                                )}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right">
                                                {t(
                                                    'dashboard.healthWorkloadProcesses',
                                                )}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {horizon.workloads.map((row) => (
                                            <TableRow key={row.name}>
                                                <TableCell className="font-medium">
                                                    {row.name}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {row.length.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {row.wait.toLocaleString()}s
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {row.processes.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
