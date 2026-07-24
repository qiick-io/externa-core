import { Link, usePage } from '@inertiajs/react';
import { Bug } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCurrentUrl } from '@/hooks/use-current-url';
import adminRoutes from '@/lib/admin-routes';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { edit } from '@/routes/profile';
import { edit as editProject } from '@/routes/project';
import { edit as editSecurity } from '@/routes/security';
import type { NavItem } from '@/types';

const DEFAULT_REPORT_BUG_URL =
    'https://github.com/qiick-io/externa-core/issues/new?template=bug_report.yml';

type SettingsLayoutProps = PropsWithChildren<{
    /** Wider content pane for tables / matrices (Access pages). */
    wide?: boolean;
}>;

/**
 * Settings section layout with sidebar nav (client-only to avoid SSR mismatch).
 */
export default function SettingsLayout({
    children,
    wide = false,
}: SettingsLayoutProps) {
    const { t } = useTranslation();
    const { isCurrentOrParentUrl } = useCurrentUrl();
    const { can } = useCan();
    const { projectSettings } = usePage().props;

    const accountNavItems: NavItem[] = [
        {
            title: t('settings.layout.profile'),
            href: edit(),
            icon: null,
        },
        {
            title: t('settings.layout.security'),
            href: editSecurity(),
            icon: null,
        },
    ];

    const projectNavItems: NavItem[] = can(
        PermissionEnum.CanManageProjectSettings,
    )
        ? [
              {
                  title: t('settings.layout.project'),
                  href: editProject(),
                  icon: null,
              },
              {
                  title: t('settings.layout.appearance'),
                  href: editAppearance(),
                  icon: null,
              },
          ]
        : [];

    const accessNavItems: NavItem[] = [
        can(PermissionEnum.CanShowRoles)
            ? {
                  title: t('settings.layout.roles'),
                  href: adminRoutes.roles.index(),
                  icon: null,
              }
            : null,
        can(PermissionEnum.CanShowPermissions)
            ? {
                  title: t('settings.layout.permissions'),
                  href: adminRoutes.permissions.index(),
                  icon: null,
              }
            : null,
        can(PermissionEnum.CanShowApiKeys)
            ? {
                  title: t('settings.layout.apiKeys'),
                  href: adminRoutes.apiKeys.index(),
                  icon: null,
              }
            : null,
        can(PermissionEnum.CanShowJobs)
            ? {
                  title: 'Jobs',
                  href: '/settings/jobs',
                  icon: null,
              }
            : null,
    ].filter((item): item is NavItem => item !== null);

    const reportBugUrl =
        projectSettings?.reportBugUrl?.trim() || DEFAULT_REPORT_BUG_URL;

    if (typeof window === 'undefined') {
        return null;
    }

    const renderNavItem = (item: NavItem, index: number) => (
        <Button
            key={`${toUrl(item.href)}-${index}`}
            size="sm"
            variant="ghost"
            asChild
            className={cn('w-full justify-start', {
                'bg-muted': isCurrentOrParentUrl(item.href),
            })}
        >
            <Link href={item.href}>
                {item.icon && <item.icon className="h-4 w-4" />}
                {item.title}
            </Link>
        </Button>
    );

    return (
        // App shell is h-svh + overflow-hidden; only the content pane scrolls.
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6">
            <Heading
                title={t('settings.layout.title')}
                description={t('settings.layout.description')}
            />

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:space-x-12">
                <aside className="w-full max-w-xl shrink-0 lg:w-48">
                    <nav
                        className="flex flex-col space-y-1 space-x-0"
                        aria-label={t('settings.layout.navAria')}
                    >
                        <p className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
                            {t('settings.layout.sectionAccount')}
                        </p>
                        {accountNavItems.map(renderNavItem)}

                        {projectNavItems.length > 0 && (
                            <>
                                <Separator className="my-2" />
                                <p className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
                                    {t('settings.layout.sectionProject')}
                                </p>
                                {projectNavItems.map(renderNavItem)}
                            </>
                        )}

                        {accessNavItems.length > 0 && (
                            <>
                                <Separator className="my-2" />
                                <p className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
                                    {t('settings.layout.sectionAccess')}
                                </p>
                                {accessNavItems.map(renderNavItem)}
                            </>
                        )}

                        <Separator className="my-2" />
                        <Button
                            size="sm"
                            variant="ghost"
                            asChild
                            className="w-full justify-start"
                        >
                            <a
                                href={reportBugUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Bug className="h-4 w-4" />
                                {t('settings.layout.reportBug')}
                            </a>
                        </Button>
                    </nav>
                </aside>

                <Separator className="my-6 shrink-0 lg:hidden" />

                {/* Scroll pane: sticky Save bars pin to this box, not the viewport. */}
                <div
                    className={cn(
                        'min-h-0 flex-1 overflow-y-auto',
                        wide ? 'md:max-w-4xl' : 'md:max-w-2xl',
                    )}
                >
                    <section
                        className={cn(
                            'space-y-12 pb-6',
                            wide ? 'max-w-4xl' : 'max-w-xl',
                        )}
                    >
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}
