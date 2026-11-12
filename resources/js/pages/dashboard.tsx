import { Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { DashboardHealthPanel } from '@/components/dashboard/dashboard-health-panel';
import { DashboardOverviewPanel } from '@/components/dashboard/dashboard-overview-panel';
import { DashboardTabs } from '@/components/dashboard/dashboard-tabs';
import type {
    DashboardOverviewMetrics,
    DashboardView,
    HealthMetrics,
} from '@/components/dashboard/dashboard-types';
import { PageLayout } from '@/components/layout/page-layout';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import type { BreadcrumbItem } from '@/types';

type DashboardProps = DashboardOverviewMetrics & {
    health?: HealthMetrics;
    /** The tab, from the URL: `/dashboard` or `/dashboard/{view}`. */
    view: DashboardView;
};

/**
 * Main dashboard with activity, storage, and upload health widgets.
 * @returns {JSX.Element}
 */
export default function Dashboard({
    health,
    view,
    ...overviewMetrics
}: DashboardProps) {
    const { t } = useTranslation();
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('dashboard.title'),
            href: dashboard(),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('dashboard.title')} />
            <DashboardTabs view={view} />
            <PageLayout scrollContent>
                {view === 'health' ? (
                    <DashboardHealthPanel health={health} />
                ) : (
                    <DashboardOverviewPanel {...overviewMetrics} />
                )}
            </PageLayout>
        </AppLayout>
    );
}
