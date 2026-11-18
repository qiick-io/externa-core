import { useTranslation } from 'react-i18next';
import { StatCard } from '@/components/stat-card';
import { formatBytes } from '@/lib/format';
import { DashboardActivityStorageRow } from '@/components/dashboard/dashboard-activity-storage-row';
import { DashboardAuditRow } from '@/components/dashboard/dashboard-audit-row';
import { DashboardInsightsSection } from '@/components/dashboard/dashboard-insights-section';
import type { DashboardOverviewMetrics } from '@/components/dashboard/dashboard-types';

/**
 * The Overview tab: file and upload stat cards, then the insights, activity / storage and
 * audit rows. The defaults cover props the server leaves out of older payloads.
 */
export function DashboardOverviewPanel({
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
}: DashboardOverviewMetrics) {
    const { t } = useTranslation();

    return (
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

            <DashboardInsightsSection
                collectionCounts={collectionCounts}
                activityOverTime={activityOverTime}
                contentEventBreakdown={contentEventBreakdown}
            />

            <div className="flex flex-col gap-4">
                <DashboardActivityStorageRow
                    latestActivity={latestActivity}
                    largestFiles={largestFiles}
                    storageTrend={storageTrend}
                />

                <DashboardAuditRow
                    suspiciousEvents={suspiciousEvents}
                    mostActiveUsers={mostActiveUsers}
                    stuckOrphanUploads={stuckOrphanUploads}
                    fileStatsByDisk={fileStatsByDisk}
                />
            </div>
        </div>
    );
}
