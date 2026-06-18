import { Link } from '@inertiajs/react';
import {
    BookOpen,
    Database,
    Folder,
    FolderGit2,
    LayoutGrid,
    Shield,
    ShieldCheck,
    Users,
    UsersRound,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavAdmin, type AdminNavItem } from '@/components/nav-admin';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { PermissionEnum } from '@/enums/permission-enum';
import adminRoutes from '@/lib/admin-routes';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from '@/components/ui/sidebar';
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
