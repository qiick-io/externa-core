import { Link } from '@inertiajs/react';
import { HeartPulse, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dashboard } from '@/routes';
import dashboardRoutes from '@/routes/dashboard';
import type { DashboardView } from '@/components/dashboard/dashboard-types';

const VIEW_ICONS = {
    overview: LayoutGrid,
    health: HeartPulse,
} as const;

/**
 * Overview / Health as line tabs under the header, each a link to its own URL
 * (app-ui `docs/page.md`, "Views: tabs under the header").
 */
export function DashboardTabs({ view }: { view: DashboardView }) {
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
