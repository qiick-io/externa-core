import { Link } from '@inertiajs/react';
import { Activity, FolderOpen, Inbox } from 'lucide-react';
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
import { DashboardBarChart } from '@/components/dashboard/dashboard-bar-chart';
import type {
    ActivityOverTimeItem,
    CollectionCountItem,
    ContentEventBreakdown,
} from '@/components/dashboard/dashboard-types';

/**
 * Overview insights row: items per collection, activity over the last seven days and the
 * created / updated / deleted content event breakdown.
 */
export function DashboardInsightsSection({
    collectionCounts,
    activityOverTime,
    contentEventBreakdown,
}: {
    collectionCounts: CollectionCountItem[];
    activityOverTime: ActivityOverTimeItem[];
    contentEventBreakdown: ContentEventBreakdown;
}) {
    const { t } = useTranslation();
    const activityLast7 = activityOverTime.slice(-7);
    const eventBreakdownChart = [
        { event: t('dashboard.created'), count: contentEventBreakdown.created },
        { event: t('dashboard.updated'), count: contentEventBreakdown.updated },
        { event: t('dashboard.deleted'), count: contentEventBreakdown.deleted },
    ];

    return (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-4">
                <CardHeader className="pb-3">
                    <CardTitle>{t('dashboard.insightsCollections')}</CardTitle>
                    <CardDescription>
                        {t('dashboard.insightsCollectionsDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div
                        role="region"
                        aria-label={t('dashboard.insightsCollections')}
                        className="max-h-64 overflow-auto"
                        tabIndex={0}
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('dashboard.collection')}
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
                                                primary={row.name}
                                                secondary={row.slug}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.items_count.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {collectionCounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell className="p-3" colSpan={2}>
                                            <PageEmptyState
                                                icon={FolderOpen}
                                                title={t(
                                                    'dashboard.noCollections',
                                                )}
                                                description={t(
                                                    'emptyState.dashboard.collectionsDescription',
                                                )}
                                                action={
                                                    <Button asChild>
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
                    <CardTitle>{t('dashboard.insightsActivity')}</CardTitle>
                    <CardDescription>
                        {t('dashboard.insightsActivityDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-56 w-full">
                        {activityLast7.every((row) => row.count === 0) ? (
                            <PageEmptyState
                                icon={Activity}
                                title={t('dashboard.noActivity7d')}
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
                                tickFormatter={(value) => value.slice(5)}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="xl:col-span-3">
                <CardHeader className="pb-3">
                    <CardTitle>{t('dashboard.contentEvents')}</CardTitle>
                    <CardDescription>
                        {t('dashboard.contentEventsDesc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-56 w-full">
                        {eventBreakdownChart.every((row) => row.count === 0) ? (
                            <PageEmptyState
                                icon={Inbox}
                                title={t('dashboard.noContentEvents')}
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
    );
}
