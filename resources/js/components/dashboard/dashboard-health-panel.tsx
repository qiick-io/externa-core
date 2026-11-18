import { Activity, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { StatCard } from '@/components/stat-card';
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
import { DashboardBarChart } from '@/components/dashboard/dashboard-bar-chart';
import type { HealthMetrics } from '@/components/dashboard/dashboard-types';

/**
 * The Health tab: queue, broadcast and Redis status, Pulse counters for the last 24 hours
 * and Horizon workloads, each with its own empty state when the service is not available.
 */
export function DashboardHealthPanel({ health }: { health?: HealthMetrics }) {
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
