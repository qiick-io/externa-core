import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PerformanceSettingsController from '@/actions/App/Http/Controllers/Settings/PerformanceSettingsController';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editPerformance } from '@/routes/performance';
import type { BreadcrumbItem } from '@/types';

type FlushAction = {
    key: string;
    title: string;
    description: string;
    button: string;
    url: string;
};

type Status = {
    cacheStore: string;
    redisReachable: boolean;
    queueConnection: string;
    appEnv: string;
    appDebug: boolean;
};

type Bootstrap = {
    configCached: boolean;
    routesCached: boolean;
    eventsCached: boolean;
    packagesCached: boolean;
};

type PublicApi = {
    ttlSeconds: number;
    epoch: number;
};

type Links = {
    jobs: string | null;
    pulse: string | null;
    horizon: string | null;
};

/**
 * Cache status and targeted flush actions.
 */
export default function PerformanceSettingsPage({
    status,
    bootstrap,
    publicApi,
    links,
}: {
    status: Status;
    bootstrap: Bootstrap;
    publicApi: PublicApi;
    links: Links;
}) {
    const { t } = useTranslation();
    const [flushing, setFlushing] = useState<string | null>(null);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.performance.breadcrumb'),
            href: editPerformance(),
        },
    ];

    const flushActions: FlushAction[] = [
        {
            key: 'publicApi',
            title: t('settings.performance.flushPublicApiTitle'),
            description: t('settings.performance.flushPublicApiDescription'),
            button: t('settings.performance.flushPublicApiButton'),
            url: PerformanceSettingsController.flushPublicApi.url(),
        },
        {
            key: 'permissionMatrices',
            title: t('settings.performance.flushPermissionMatricesTitle'),
            description: t(
                'settings.performance.flushPermissionMatricesDescription',
            ),
            button: t('settings.performance.flushPermissionMatricesButton'),
            url: PerformanceSettingsController.flushPermissionMatrices.url(),
        },
        {
            key: 'spatiePermissions',
            title: t('settings.performance.flushSpatiePermissionsTitle'),
            description: t(
                'settings.performance.flushSpatiePermissionsDescription',
            ),
            button: t('settings.performance.flushSpatiePermissionsButton'),
            url: PerformanceSettingsController.flushSpatiePermissions.url(),
        },
        {
            key: 'dashboardMetrics',
            title: t('settings.performance.flushDashboardMetricsTitle'),
            description: t(
                'settings.performance.flushDashboardMetricsDescription',
            ),
            button: t('settings.performance.flushDashboardMetricsButton'),
            url: PerformanceSettingsController.flushDashboardMetrics.url(),
        },
    ];

    const runFlush = (action: FlushAction): void => {
        setFlushing(action.key);
        router.post(
            action.url,
            {},
            {
                preserveScroll: true,
                onFinish: () => setFlushing(null),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.performance.head')} />

            <h1 className="sr-only">{t('settings.performance.head')}</h1>

            <SettingsLayout>
                <div className="space-y-10">
                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.performance.statusTitle')}
                            description={t(
                                'settings.performance.statusDescription',
                            )}
                        />

                        <dl className="grid gap-4 text-sm">
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.cacheStore')}
                                </dt>
                                <dd
                                    className="font-mono"
                                    data-test="performance-cache-store"
                                >
                                    {status.cacheStore}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.redisReachable')}
                                </dt>
                                <dd data-test="performance-redis-reachable">
                                    {status.redisReachable
                                        ? t('settings.performance.yes')
                                        : t('settings.performance.no')}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.queueConnection')}
                                </dt>
                                <dd
                                    className="font-mono"
                                    data-test="performance-queue-connection"
                                >
                                    {status.queueConnection}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.appEnv')}
                                </dt>
                                <dd
                                    className="font-mono"
                                    data-test="performance-app-env"
                                >
                                    {status.appEnv}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.appDebug')}
                                </dt>
                                <dd data-test="performance-app-debug">
                                    {status.appDebug
                                        ? t('settings.performance.yes')
                                        : t('settings.performance.no')}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <Separator />

                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.performance.bootstrapTitle')}
                            description={t(
                                'settings.performance.bootstrapDescription',
                            )}
                        />

                        <dl className="grid gap-4 text-sm">
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.configCached')}
                                </dt>
                                <dd data-test="performance-config-cached">
                                    {bootstrap.configCached
                                        ? t('settings.performance.yes')
                                        : t('settings.performance.no')}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.routesCached')}
                                </dt>
                                <dd data-test="performance-routes-cached">
                                    {bootstrap.routesCached
                                        ? t('settings.performance.yes')
                                        : t('settings.performance.no')}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.eventsCached')}
                                </dt>
                                <dd data-test="performance-events-cached">
                                    {bootstrap.eventsCached
                                        ? t('settings.performance.yes')
                                        : t('settings.performance.no')}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.packagesCached')}
                                </dt>
                                <dd data-test="performance-packages-cached">
                                    {bootstrap.packagesCached
                                        ? t('settings.performance.yes')
                                        : t('settings.performance.no')}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <Separator />

                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.performance.publicApiTitle')}
                            description={t(
                                'settings.performance.publicApiDescription',
                            )}
                        />

                        <dl className="grid gap-4 text-sm">
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.ttlSeconds')}
                                </dt>
                                <dd data-test="performance-public-api-ttl">
                                    {publicApi.ttlSeconds}
                                </dd>
                            </div>
                            <div className="grid gap-1">
                                <dt className="text-muted-foreground">
                                    {t('settings.performance.epoch')}
                                </dt>
                                <dd data-test="performance-public-api-epoch">
                                    {publicApi.epoch}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    <Separator />

                    {(links.jobs || links.pulse || links.horizon) && (
                        <>
                            <div className="space-y-6">
                                <Heading
                                    variant="small"
                                    title={t(
                                        'settings.performance.observabilityTitle',
                                    )}
                                    description={t(
                                        'settings.performance.observabilityDescription',
                                    )}
                                />

                                <div className="flex gap-3 flex-wrap">
                                    {links.jobs && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                            data-test="performance-link-jobs"
                                        >
                                            <a href={links.jobs}>
                                                {t(
                                                    'settings.performance.linkJobs',
                                                )}
                                            </a>
                                        </Button>
                                    )}
                                    {links.pulse && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                            data-test="performance-link-pulse"
                                        >
                                            <a href={links.pulse}>
                                                {t(
                                                    'settings.performance.linkPulse',
                                                )}
                                            </a>
                                        </Button>
                                    )}
                                    {links.horizon && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                            data-test="performance-link-horizon"
                                        >
                                            <a href={links.horizon}>
                                                {t(
                                                    'settings.performance.linkHorizon',
                                                )}
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <Separator />
                        </>
                    )}


                    <div className="space-y-6">
                        <Heading
                            variant="small"
                            title={t('settings.performance.flushTitle')}
                            description={t(
                                'settings.performance.flushDescription',
                            )}
                        />

                        <div className="space-y-6">
                            {flushActions.map((action) => (
                                <div key={action.key} className="space-y-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">
                                            {action.title}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {action.description}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={flushing !== null}
                                        data-test={`performance-flush-${action.key}`}
                                        onClick={() => runFlush(action)}
                                    >
                                        {flushing === action.key
                                            ? t('settings.performance.flushing')
                                            : action.button}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
