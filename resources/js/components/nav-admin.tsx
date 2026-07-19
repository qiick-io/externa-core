import { Link } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

/**
 * Permission-gated sidebar group for admin and directory links.
 * @param {{ items: NavItem[], label?: string }} props - Component props.
 * @param {NavItem[]} props.items - Nav entries with optional permission metadata.
 * @param {string} [props.label] - Optional group label above the menu.
 * @returns {JSX.Element | null}
 */
export function NavAdmin({
    items,
    label,
}: {
    items: NavItem[];
    label?: string;
}) {
    const { isCurrentUrl } = useCurrentUrl();
    const { can } = useCan();

    const visible = items.filter((item) => {
        const permission = (item as NavItem & { permission?: string })
            .permission;

        return !permission || can(permission);
    });

    if (visible.length === 0) {
        return null;
    }

    return (
        <SidebarGroup className="px-2 py-0">
            {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
            <SidebarMenu>
                {visible.map((item) => (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={isCurrentUrl(item.href)}
                            tooltip={{ children: item.title }}
                        >
                            <Link href={item.href} prefetch>
                                {item.icon && <item.icon />}
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}

export type AdminNavItem = NavItem & { permission?: PermissionEnum | string };
