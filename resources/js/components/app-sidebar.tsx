import { Link } from '@inertiajs/react';
import {
    BookOpen,
    Database,
    Folder,
    FolderGit2,
    LayoutGrid,
    ScrollText,
    Shield,
    ShieldCheck,
    Sparkles,
    Users,
    UsersRound,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavAdmin, type AdminNavItem } from '@/components/nav-admin';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from '@/components/ui/sidebar';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCurrentUrl } from '@/hooks/use-current-url';
import adminRoutes from '@/lib/admin-routes';
import { cn } from '@/lib/utils';
import { index as aiIndex } from '@/routes/ai';
import collections from '@/routes/collections';
import { dashboard } from '@/routes';
import type { NavItem } from '@/types';
import type { MainNavItem } from '@/components/nav-main';

const mainNavItems: MainNavItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
        icon: LayoutGrid,
    },
    {
        title: 'Files',
        href: adminRoutes.files.index(),
        icon: Folder,
        permission: PermissionEnum.CanShowFiles,
    },
    {
        title: 'Collections',
        href: collections.index.url(),
        icon: Database,
        permission: PermissionEnum.CanShowCollections,
    },
    {
        title: 'Activity Log',
        href: adminRoutes.activityLogs.index(),
        icon: ScrollText,
        permission: PermissionEnum.CanShowActivityLogs,
    },
];

const directoryNavItems: AdminNavItem[] = [
    {
        title: 'Users',
        href: adminRoutes.users.index(),
        icon: Users,
        permission: PermissionEnum.CanShowUsers,
    },
    {
        title: 'Groups',
        href: adminRoutes.groups.index(),
        icon: UsersRound,
        permission: PermissionEnum.CanShowGroups,
    },
];

const adminNavItems: AdminNavItem[] = [
    {
        title: 'Roles',
        href: adminRoutes.roles.index(),
        icon: Shield,
        permission: PermissionEnum.CanShowRoles,
    },
    {
        title: 'Permissions',
        href: adminRoutes.permissions.index(),
        icon: ShieldCheck,
        permission: PermissionEnum.CanShowPermissions,
    },
];

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/laravel/react-starter-kit',
        icon: FolderGit2,
    },
    {
        title: 'Documentation',
        href: 'https://laravel.com/docs/starter-kits#react',
        icon: BookOpen,
    },
];

export function AppSidebar() {
    const { can } = useCan();
    const { isCurrentUrl } = useCurrentUrl();
    const canUseAi = can(PermissionEnum.CanUseAi);

    return (
        <Sidebar collapsible="icon" variant="inset">
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
                {canUseAi ? (
                    <SidebarGroup className="px-2 py-0">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    isActive={isCurrentUrl(
                                        aiIndex.url(),
                                        undefined,
                                        true,
                                    )}
                                    tooltip={{ children: 'Assistente' }}
                                    className={cn(
                                        'text-white hover:text-white active:text-white',
                                        'bg-gradient-to-br from-orange-500 via-rose-500 to-amber-400',
                                        'hover:bg-gradient-to-br hover:from-orange-500 hover:via-rose-500 hover:to-amber-400',
                                        'data-[active=true]:bg-gradient-to-br data-[active=true]:from-orange-500 data-[active=true]:via-rose-500 data-[active=true]:to-amber-400',
                                        'data-[active=true]:text-white',
                                    )}
                                >
                                    <Link href={aiIndex.url()} prefetch>
                                        <Sparkles />
                                        <span>Assistente</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroup>
                ) : null}
                <NavMain items={mainNavItems} />
                <SidebarSeparator className="mx-0" />
                <NavAdmin items={directoryNavItems} />
                <NavAdmin items={adminNavItems} label="Admin" />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
