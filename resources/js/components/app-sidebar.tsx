import { Link, usePage } from '@inertiajs/react';
import {
    BookOpen,
    Database,
    Folder,
    FolderGit2,
    LayoutGrid,
    ScrollText,
    Settings,
    Sparkles,
    Users,
    UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavUser } from '@/components/nav-user';
import { NotificationsBell } from '@/components/notifications/notifications-bell';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCurrentUrl } from '@/hooks/use-current-url';
import adminRoutes from '@/lib/admin-routes';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import { index as aiIndex } from '@/routes/ai';
import collections from '@/routes/collections';
import { edit as editProfile } from '@/routes/profile';
import type { NavItem, SidebarModuleSetting } from '@/types';

type ModuleDef = {
    id: string;
    titleKey: string;
    href: NavItem['href'];
    icon: LucideIcon;
    permission?: PermissionEnum;
    accent?: boolean;
};

/** Always first in the nav, regardless of persisted module order. */
const PINNED_SIDEBAR_MODULE_IDS = ['ai'] as const;

/**
 * Primary application sidebar with navigation and user menu.
 */
export function AppSidebar() {
    const { t } = useTranslation();
    const { can } = useCan();
    const { isCurrentUrl } = useCurrentUrl();
    const { projectSettings } = usePage().props;

    const moduleDefs = useMemo<Record<string, ModuleDef>>(
        () => ({
            dashboard: {
                id: 'dashboard',
                titleKey: 'nav.dashboard',
                href: dashboard(),
                icon: LayoutGrid,
            },
            ai: {
                id: 'ai',
                titleKey: 'nav.assistant',
                href: aiIndex.url(),
                icon: Sparkles,
                permission: PermissionEnum.CanUseAi,
                accent: true,
            },
            files: {
                id: 'files',
                titleKey: 'nav.files',
                href: adminRoutes.files.index(),
                icon: Folder,
                permission: PermissionEnum.CanShowFiles,
            },
            collections: {
                id: 'collections',
                titleKey: 'nav.collections',
                href: collections.index.url(),
                icon: Database,
                permission: PermissionEnum.CanShowCollections,
            },
            activity: {
                id: 'activity',
                titleKey: 'nav.activityLog',
                href: adminRoutes.activityLogs.index(),
                icon: ScrollText,
                permission: PermissionEnum.CanShowActivityLogs,
            },
            users: {
                id: 'users',
                titleKey: 'nav.users',
                href: adminRoutes.users.index(),
                icon: Users,
                permission: PermissionEnum.CanShowUsers,
            },
            groups: {
                id: 'groups',
                titleKey: 'nav.groups',
                href: adminRoutes.groups.index(),
                icon: UsersRound,
                permission: PermissionEnum.CanShowGroups,
            },
            settings: {
                id: 'settings',
                titleKey: 'nav.settings',
                href: editProfile(),
                icon: Settings,
            },
        }),
        [],
    );

    const modules: SidebarModuleSetting[] =
        projectSettings?.sidebarModules ??
        Object.keys(moduleDefs).map((id) => ({
            id,
            enabled: true,
            locked: id === 'dashboard' || id === 'ai',
        }));

    const visibleModules = pinModulesFirst(
        modules
            .filter((module) => module.enabled)
            .map((module) => moduleDefs[module.id])
            .filter((def): def is ModuleDef => !!def)
            .filter((def) => !def.permission || can(def.permission)),
    );

    const pinnedIds = new Set<string>(PINNED_SIDEBAR_MODULE_IDS);
    const pinnedModules = visibleModules.filter((item) =>
        pinnedIds.has(item.id),
    );
    const platformModules = visibleModules.filter(
        (item) => !pinnedIds.has(item.id),
    );

    const footerNavItems: NavItem[] = [
        {
            title: t('nav.repository'),
            href: 'https://github.com/laravel/react-starter-kit',
            icon: FolderGit2,
        },
        {
            title: t('nav.documentation'),
            href: 'https://docs.externa.qiick.io',
            icon: BookOpen,
        },
    ];

    const renderModuleItem = (item: ModuleDef) => (
        <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
                asChild
                isActive={isCurrentUrl(
                    item.id === 'settings' ? '/settings' : item.href,
                    undefined,
                    item.id === 'ai' || item.id === 'settings',
                )}
                tooltip={{ children: t(item.titleKey) }}
                className={
                    item.accent
                        ? cn(
                              'sidebar-ai-nav relative overflow-hidden',
                              'text-orange-700 hover:text-orange-700',
                              'dark:text-orange-300 dark:hover:text-orange-300',
                              'data-[active=true]:font-medium',
                              'data-[active=true]:text-orange-700',
                              'dark:data-[active=true]:text-orange-300',
                          )
                        : undefined
                }
            >
                <Link href={item.href} prefetch>
                    <item.icon />
                    <span>{t(item.titleKey)}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );

    return (
        <Sidebar
            collapsible="icon"
            variant="inset"
            role="navigation"
            aria-label={t('a11y.mainNav')}
        >
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {pinnedModules.length > 0 ? (
                    <SidebarGroup className="px-2 py-0">
                        <SidebarMenu>
                            {pinnedModules.map(renderModuleItem)}
                        </SidebarMenu>
                    </SidebarGroup>
                ) : null}

                {platformModules.length > 0 ? (
                    <SidebarGroup className="px-2 py-0">
                        <SidebarGroupLabel>
                            {t('nav.platform')}
                        </SidebarGroupLabel>
                        <SidebarMenu>
                            {platformModules.map(renderModuleItem)}
                        </SidebarMenu>
                    </SidebarGroup>
                ) : null}
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NotificationsBell />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

function pinModulesFirst<T extends { id: string }>(items: T[]): T[] {
    const pinnedIds = new Set<string>(PINNED_SIDEBAR_MODULE_IDS);
    const pinned = PINNED_SIDEBAR_MODULE_IDS.map((id) =>
        items.find((item) => item.id === id),
    ).filter((item): item is T => !!item);
    const rest = items.filter((item) => !pinnedIds.has(item.id));

    return [...pinned, ...rest];
}
