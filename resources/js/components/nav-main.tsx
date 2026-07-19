import { Link } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCan } from '@/hooks/use-can';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export type MainNavItem = NavItem & { permission?: string };

/**
 * Primary sidebar navigation filtered by permission.
 * @param {{ items?: MainNavItem[] }} props - Component props.
 * @param {MainNavItem[]} [props.items=[]] - Nav entries with optional permission gates.
 * @returns {JSX.Element | null}
 */
export function NavMain({ items = [] }: { items?: MainNavItem[] }) {
    const { isCurrentUrl } = useCurrentUrl();
    const { can } = useCan();

    const visible = items.filter(
        (item) => !item.permission || can(item.permission),
    );

    if (visible.length === 0) {
        return null;
    }

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
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
