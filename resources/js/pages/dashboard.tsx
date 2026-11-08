import { Deferred, Head, Link } from '@inertiajs/react';
import {
    Activity,
    FolderOpen,
    HardDrive,
    HeartPulse,
    Inbox,
    LayoutGrid,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { TableCellLine } from '@/components/admin/table-cell-line';
import { PageLayout } from '@/components/layout/page-layout';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { formatBytes } from '@/lib/format';
import { dashboard } from '@/routes';
import activityLogs from '@/routes/activity-logs';
import dashboardRoutes from '@/routes/dashboard';
import files from '@/routes/files';
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
    /** The tab, from the URL: `/dashboard` or `/dashboard/{view}`. */
    view: DashboardView;
};

type DashboardView = 'overview' | 'health';

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
    view,
}: DashboardProps) {
    const { t } = useTranslation();
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
            <DashboardTabs view={view} />
            <PageLayout scrollContent>
                {view === 'health' ? (
                    <DashboardHealthPanel health={health} />
                ) : (
                    <div className="flex flex-col gap-4">
                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
                            <StatCard
                                className="xl:col-span-3"
                                label={t('dashboard.files')}
                                value={fileStats.files_count.toLocaleString()}
                                headline={t('dashboard.statFilesHeadline', {
                                    count: fileStats.folders_count,
                                })}
                            />
                            <StatCard
                                className="xl:col-span-3"
                                label={t('dashboard.totalSize')}
                                value={formatBytes(fileStats.files_size_sum)}
                                context={t('dashboard.statSizeContext')}
                            />
                            <StatCard
                                className="xl:col-span-3"
                                label={t('dashboard.statUploadsInProgress')}
                                value={uploadHealth.in_progress_count.toLocaleString()}
                                context={t('dashboard.statInProgressContext')}
                            />
                            <StatCard
                                className="xl:col-span-3"
                                label={t('dashboard.statStaleUploads')}
                                value={uploadHealth.stale_count.toLocaleString()}
                                context={t('dashboard.statStaleContext')}
                            />
                        </section>

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
                                    <div
                                        role="region"
                                        aria-label={t(
                                            'dashboard.insightsCollections',
                                        )}
                                        className="max-h-64 overflow-auto"
                                        tabIndex={0}
                                    >
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>
                                                        {t(
                                                            'dashboard.collection',
                                                        )}
                                                    </TableHead>
                                                    <TableHead className="w-[6rem] text-right tabular-nums">
                                                        {t('dashboard.items')}
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody className="[&_td]:h-10">
                                                {collectionCounts.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell className="max-w-0 min-w-0">
                                                            <TableCellLine
                                                                primary={
                                                                    row.name
                                                                }
                                                                secondary={
                                                                    row.slug
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {row.items_count.toLocaleString()}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {collectionCounts.length ===
                                                0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            className="p-3"
                                                            colSpan={2}
                                                        >
                                                            <PageEmptyState
                                                                icon={
                                                                    FolderOpen
                                                                }
                                                                title={t(
                                                                    'dashboard.noCollections',
                                                                )}
                                                                description={t(
                                                                    'emptyState.dashboard.collectionsDescription',
                                                                )}
                                                                action={
                                                                    <Button
                                                                        asChild
                                                                    >
                                                                        <Link href="/collections">
                                                                            {t(
                                                                                'emptyState.dashboard.collectionsCta',
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
                                            <PageEmptyState
                                                icon={Activity}
                                                title={t(
                                                    'dashboard.noActivity7d',
                                                )}
                                                description={t(
                                                    'emptyState.dashboard.activityDescription',
                                                )}
                                                compact
                                                className="h-full border-0"
                                            />
                                        ) : (
                                            <DashboardBarChart
                                                data={activityLast7}
                                                categoryKey="date"
                                                label={t('dashboard.events')}
                                                color="var(--color-primary)"
                                                tickFormatter={(value) =>
                                                    value.slice(5)
                                                }
                                            />
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
                                            <PageEmptyState
                                                icon={Inbox}
                                                title={t(
                                                    'dashboard.noContentEvents',
                                                )}
                                                description={t(
                                                    'emptyState.dashboard.genericDescription',
                                                )}
                                                compact
                                                className="h-full border-0"
                                            />
                                        ) : (
                                            <DashboardBarChart
                                                data={eventBreakdownChart}
                                                categoryKey="event"
                                                label={t('dashboard.events')}
                                                color="var(--color-chart-2, var(--color-primary))"
                                            />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 gap-4 xl:h-[clamp(28rem,52vh,36rem)] xl:grid-cols-12">
                                <Card className="h-full max-h-[28rem] min-h-[18rem] gap-4 xl:col-span-5 xl:max-h-none xl:min-h-0">
                                    <CardHeader className="shrink-0 pb-3">
                                        <CardTitle>
                                            {t('dashboard.latestActivity')}
                                        </CardTitle>
                                        <CardDescription>
                                            {t('dashboard.latestActivityDesc')}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                                        <div
                                            role="region"
                                            aria-label={t(
                                                'dashboard.latestActivity',
                                            )}
                                            className="max-h-[20rem] min-h-[10rem] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1 [&_[data-slot=table-container]]:overflow-visible"
                                            tabIndex={0}
                                        >
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
                                                        <TableHead className="w-[10rem] text-right tabular-nums">
                                                            {t(
                                                                'dashboard.when',
                                                            )}
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody className="[&_td]:h-10">
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
                                                                <TableCell className="max-w-0 min-w-0">
                                                                    <TableCellLine
                                                                        primary={
                                                                            activity.description ??
                                                                            '—'
                                                                        }
                                                                        secondary={
                                                                            activity
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
                                                        ),
                                                    )}
                                                    {latestActivity.length ===
                                                    0 ? (
                                                        <TableRow>
                                                            <TableCell
                                                                className="p-3"
                                                                colSpan={3}
                                                            >
                                                                <PageEmptyState
                                                                    icon={Inbox}
                                                                    title={t(
                                                                        'dashboard.noActivity',
                                                                    )}
                                                                    description={t(
                                                                        'emptyState.dashboard.activityDescription',
                                                                    )}
                                                                    action={
                                                                        <Button
                                                                            asChild
                                                                        >
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
                                            <CardTitle>
                                                {t('dashboard.largestFiles')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.largestFilesDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex min-h-0 flex-1 flex-col">
                                            <Deferred
                                                data="largestFiles"
                                                fallback={
                                                    <DashboardTableSkeleton />
                                                }
                                            >
                                                <div
                                                    role="region"
                                                    aria-label={t(
                                                        'dashboard.largestFiles',
                                                    )}
                                                    className="max-h-[20rem] min-h-[10rem] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1"
                                                    tabIndex={0}
                                                >
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>
                                                                    {t(
                                                                        'dashboard.file',
                                                                    )}
                                                                </TableHead>
                                                                <TableHead className="w-[7rem] text-right tabular-nums">
                                                                    {t(
                                                                        'dashboard.size',
                                                                    )}
                                                                </TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody className="[&_td]:h-10">
                                                            {(
                                                                largestFiles ??
                                                                []
                                                            ).map((file) => (
                                                                <TableRow
                                                                    key={
                                                                        file.id
                                                                    }
                                                                >
                                                                    <TableCell className="max-w-0 min-w-0">
                                                                        <TableCellLine
                                                                            primary={
                                                                                file.name
                                                                            }
                                                                            secondary={`${file.disk} · ${file.path}`}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell className="text-right tabular-nums">
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
                                                                        className="p-3"
                                                                        colSpan={
                                                                            2
                                                                        }
                                                                    >
                                                                        <PageEmptyState
                                                                            icon={
                                                                                HardDrive
                                                                            }
                                                                            title={t(
                                                                                'dashboard.noFiles',
                                                                            )}
                                                                            description={t(
                                                                                'emptyState.dashboard.filesDescription',
                                                                            )}
                                                                            action={
                                                                                <Button
                                                                                    asChild
                                                                                >
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
                                            <CardTitle>
                                                {t('dashboard.storageTrend')}
                                            </CardTitle>
                                            <CardDescription>
                                                {t(
                                                    'dashboard.storageTrendDesc',
                                                )}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex min-h-0 flex-1 flex-col">
                                            <Deferred
                                                data="storageTrend"
                                                fallback={
                                                    <DashboardTableSkeleton />
                                                }
                                            >
                                                <div
                                                    role="region"
                                                    aria-label={t(
                                                        'dashboard.storageTrend',
                                                    )}
                                                    className="max-h-[20rem] min-h-[10rem] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1"
                                                    tabIndex={0}
                                                >
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>
                                                                    {t(
                                                                        'dashboard.date',
                                                                    )}
                                                                </TableHead>
                                                                <TableHead className="w-[8rem] text-right tabular-nums">
                                                                    {t(
                                                                        'dashboard.added',
                                                                    )}
                                                                </TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody className="[&_td]:h-10">
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
                                                                        <TableCell className="text-right tabular-nums">
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
                                                                        className="p-3"
                                                                        colSpan={
                                                                            2
                                                                        }
                                                                    >
                                                                        <PageEmptyState
                                                                            icon={
                                                                                Inbox
                                                                            }
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

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                                <div className="flex flex-col gap-4 xl:col-span-5">
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
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                {t(
                                                                    'dashboard.descriptionCol',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="w-[10rem] text-right tabular-nums">
                                                                {t(
                                                                    'dashboard.when',
                                                                )}
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody className="[&_td]:h-10">
                                                        {suspiciousEvents.map(
                                                            (event) => (
                                                                <TableRow
                                                                    key={
                                                                        event.id
                                                                    }
                                                                >
                                                                    <TableCell className="max-w-0 min-w-0">
                                                                        <TableCellLine
                                                                            primary={
                                                                                event.description ??
                                                                                '—'
                                                                            }
                                                                            secondary={
                                                                                event
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
                                                            ),
                                                        )}
                                                        {suspiciousEvents.length ===
                                                        0 ? (
                                                            <TableRow>
                                                                <TableCell
                                                                    className="p-3"
                                                                    colSpan={2}
                                                                >
                                                                    <PageEmptyState
                                                                        icon={
                                                                            Inbox
                                                                        }
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
                                                <CardTitle>
                                                    {t('dashboard.mostActive')}
                                                </CardTitle>
                                                <CardDescription>
                                                    {t(
                                                        'dashboard.mostActiveDesc',
                                                    )}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>
                                                                    {t(
                                                                        'dashboard.user',
                                                                    )}
                                                                </TableHead>
                                                                <TableHead className="w-[6rem] text-right tabular-nums">
                                                                    {t(
                                                                        'dashboard.events',
                                                                    )}
                                                                </TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody className="[&_td]:h-10">
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
                                                                        <TableCell className="text-right tabular-nums">
                                                                            {user.activity_count.toLocaleString()}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ),
                                                            )}
                                                            {mostActiveUsers.length ===
                                                            0 ? (
                                                                <TableRow>
                                                                    <TableCell
                                                                        className="p-3"
                                                                        colSpan={
                                                                            2
                                                                        }
                                                                    >
                                                                        <PageEmptyState
                                                                            icon={
                                                                                Inbox
                                                                            }
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
                                                <CardTitle>
                                                    {t(
                                                        'dashboard.stuckUploads',
                                                    )}
                                                </CardTitle>
                                                <CardDescription>
                                                    {t(
                                                        'dashboard.stuckUploadsDesc',
                                                    )}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>
                                                                    {t(
                                                                        'dashboard.upload',
                                                                    )}
                                                                </TableHead>
                                                                <TableHead className="w-[6rem] text-right tabular-nums">
                                                                    {t(
                                                                        'dashboard.chunks',
                                                                    )}
                                                                </TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody className="[&_td]:h-10">
                                                            {stuckOrphanUploads.map(
                                                                (upload) => (
                                                                    <TableRow
                                                                        key={
                                                                            upload.id
                                                                        }
                                                                    >
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
                                                                ),
                                                            )}
                                                            {stuckOrphanUploads.length ===
                                                            0 ? (
                                                                <TableRow>
                                                                    <TableCell
                                                                        className="p-3"
                                                                        colSpan={
                                                                            2
                                                                        }
                                                                    >
                                                                        <PageEmptyState
                                                                            icon={
                                                                                Inbox
                                                                            }
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
                                                <DashboardTableSkeleton />
                                            }
                                        >
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>
                                                                {t(
                                                                    'dashboard.disk',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="text-right tabular-nums">
                                                                {t(
                                                                    'dashboard.files',
                                                                )}
                                                            </TableHead>
                                                            <TableHead className="text-right tabular-nums">
                                                                {t(
                                                                    'dashboard.size',
                                                                )}
                                                            </TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody className="[&_td]:h-10">
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
                                                                    <TableCell className="text-right tabular-nums">
                                                                        {row.files_count.toLocaleString()}
                                                                    </TableCell>
                                                                    <TableCell className="text-right tabular-nums">
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
                                                                    className="p-3"
                                                                    colSpan={3}
                                                                >
                                                                    <PageEmptyState
                                                                        icon={
                                                                            Inbox
                                                                        }
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
                    </div>
                )}
            </PageLayout>
        </AppLayout>
    );
}

const VIEW_ICONS = {
    overview: LayoutGrid,
    health: HeartPulse,
} as const;

/**
 * Overview / Health as line tabs under the header, each a link to its own URL
 * (app-ui `docs/page.md`, "Views: tabs under the header").
 */
function DashboardTabs({ view }: { view: DashboardView }) {
    const { t } = useTranslation();
    const views: DashboardView[] = ['overview', 'health'];

    return (
        <Tabs
            value={view}
            activationMode="manual"
            className="overflow-x-auto border-b px-4"
        >
            <TabsList
                variant="line"
                aria-label={t('dashboard.tabsLabel')}
                data-test="dashboard-tabs"
            >
                {views.map((item) => {
                    const Icon = VIEW_ICONS[item];

                    return (
                        <TabsTrigger
                            key={item}
                            value={item}
                            data-test={`dashboard-tab-${item}`}
                            // Each tab is a link to its own URL, so there is no tab panel to point at.
                            aria-controls={undefined}
                            asChild
                        >
                            <Link
                                href={
                                    item === 'overview'
                                        ? dashboard.url()
                                        : dashboardRoutes.view.url(item)
                                }
                                preserveScroll
                            >
                                <Icon />
                                {item === 'overview'
                                    ? t('dashboard.tabOverview')
                                    : t('dashboard.tabHealth')}
                            </Link>
                        </TabsTrigger>
                    );
                })}
            </TabsList>
        </Tabs>
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
    const pulseContext = health.pulse_enabled
        ? t('dashboard.healthPulseDesc', { ingest: health.pulse_ingest })
        : t('dashboard.healthPulseOff');
    const horizonStats = [
        {
            label: t('dashboard.healthHorizonStatus'),
            value:
                horizon.status === 'running'
                    ? t('dashboard.healthHorizonRunning')
                    : t('dashboard.healthHorizonStopped'),
        },
        {
            label: t('dashboard.healthHorizonPending'),
            value: horizon.pending.toLocaleString(),
        },
        {
            label: t('dashboard.healthHorizonFailed'),
            value: horizon.failed.toLocaleString(),
        },
        {
            label: t('dashboard.healthHorizonProcesses'),
            value: horizon.processes.toLocaleString(),
        },
        {
            label: t('dashboard.healthHorizonThroughput'),
            value: (horizon.jobs_per_minute ?? 0).toLocaleString(),
        },
        {
            label: t('dashboard.healthFailedJobs'),
            value: health.failed_jobs.toLocaleString(),
        },
    ];

    return (
        <div className="flex flex-col gap-4" data-test="dashboard-health">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
                <StatCard
                    className="xl:col-span-3"
                    label={t('dashboard.healthQueue')}
                    value={health.queue_connection}
                />
                <StatCard
                    className="xl:col-span-3"
                    label={t('dashboard.healthBroadcast')}
                    value={health.broadcast_connection}
                />
                <StatCard
                    className="xl:col-span-3"
                    label={t('dashboard.healthRedis')}
                    value={
                        health.redis_ok
                            ? t('dashboard.healthOk')
                            : t('dashboard.healthDown')
                    }
                />
                <StatCard
                    className="xl:col-span-3"
                    label={t('dashboard.healthPendingJobs')}
                    value={health.pending_jobs.toLocaleString()}
                    headline={t('dashboard.statFailedJobsHeadline', {
                        count: health.failed_jobs,
                    })}
                />
            </section>

            {health.pulse_available ? (
                <section
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12"
                    aria-label={t('dashboard.healthPulseTitle')}
                >
                    {pulseChart.map((row) => (
                        <StatCard
                            key={row.metric}
                            className="xl:col-span-4"
                            label={row.metric}
                            value={row.count.toLocaleString()}
                            context={pulseContext}
                        />
                    ))}
                </section>
            ) : null}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                {!health.pulse_available ? (
                    <Card className="xl:col-span-5">
                        <CardHeader className="pb-3">
                            <CardTitle>
                                {t('dashboard.healthPulseTitle')}
                            </CardTitle>
                            <CardDescription>{pulseContext}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                {t('dashboard.healthPulseEmpty')}
                            </p>
                        </CardContent>
                    </Card>
                ) : null}

                <Card
                    className={
                        health.pulse_available
                            ? 'xl:col-span-12'
                            : 'xl:col-span-7'
                    }
                >
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
                                <PageEmptyState
                                    icon={Activity}
                                    title={t('dashboard.healthPulseQuiet')}
                                    description={t(
                                        'emptyState.dashboard.genericDescription',
                                    )}
                                    compact
                                    className="h-full border-0"
                                />
                            ) : (
                                <DashboardBarChart
                                    data={pulseChart}
                                    categoryKey="metric"
                                    label={t('dashboard.events')}
                                    color="var(--color-primary)"
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </section>

            {horizon.available ? (
                <section
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12"
                    aria-label={t('dashboard.healthHorizonTitle')}
                >
                    {horizonStats.map((stat) => (
                        <StatCard
                            key={stat.label}
                            className="xl:col-span-4"
                            label={stat.label}
                            value={stat.value}
                            context={t('dashboard.healthHorizonTitle')}
                        />
                    ))}
                </section>
            ) : null}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                {!horizon.available ? (
                    <Card className="xl:col-span-5">
                        <CardHeader className="pb-3">
                            <CardTitle>
                                {t('dashboard.healthHorizonTitle')}
                            </CardTitle>
                            <CardDescription>
                                {t('dashboard.healthHorizonUnavailable')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                {t('dashboard.healthHorizonEmpty')}
                            </p>
                        </CardContent>
                    </Card>
                ) : null}

                <Card
                    className={
                        horizon.available ? 'xl:col-span-12' : 'xl:col-span-7'
                    }
                >
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
                            <PageEmptyState
                                icon={Inbox}
                                title={t('dashboard.healthWorkloadsEmpty')}
                                description={t(
                                    'emptyState.dashboard.genericDescription',
                                )}
                                compact
                                className="border-0"
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t(
                                                    'dashboard.healthWorkloadQueue',
                                                )}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right tabular-nums">
                                                {t(
                                                    'dashboard.healthWorkloadLength',
                                                )}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right tabular-nums">
                                                {t(
                                                    'dashboard.healthWorkloadWait',
                                                )}
                                            </TableHead>
                                            <TableHead className="w-[6rem] text-right tabular-nums">
                                                {t(
                                                    'dashboard.healthWorkloadProcesses',
                                                )}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="[&_td]:h-10">
                                        {horizon.workloads.map((row) => (
                                            <TableRow key={row.name}>
                                                <TableCell className="font-medium">
                                                    {row.name}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {row.length.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {t(
                                                        'dashboard.healthWorkloadWaitSeconds',
                                                        {
                                                            seconds:
                                                                row.wait.toLocaleString(),
                                                        },
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
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

/**
 * One-series bar chart on the shadcn ChartContainer: theme-coloured bars and the chart
 * tooltip (ChartTooltipContent) instead of recharts' default one. `data` rows carry a
 * `count` and the category under `categoryKey`.
 */
function DashboardBarChart({
    data,
    categoryKey,
    label,
    color,
    tickFormatter,
}: {
    data: Array<Record<string, unknown>>;
    categoryKey: string;
    label: string;
    color: string;
    tickFormatter?: (value: string) => string;
}) {
    const chartConfig = { count: { label, color } } satisfies ChartConfig;

    return (
        <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full w-full"
        >
            <BarChart data={data} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey={categoryKey}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={tickFormatter}
                />
                <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
        </ChartContainer>
    );
}

/**
 * Placeholder rows for a deferred dashboard table while its data loads.
 */
function DashboardTableSkeleton() {
    const { t } = useTranslation();

    return (
        <div
            role="status"
            aria-label={t('dashboard.loading')}
            className="flex flex-col gap-2"
        >
            {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
            ))}
        </div>
    );
}
