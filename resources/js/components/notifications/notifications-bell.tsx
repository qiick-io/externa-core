import { usePage } from '@inertiajs/react';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NotificationsDrawer } from '@/components/notifications/notifications-drawer';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
    fetchUnreadNotificationCount,
    NOTIFICATIONS_UPDATED_EVENT,
} from '@/lib/notifications-api';
import { cn } from '@/lib/utils';

const UNREAD_POLL_INTERVAL_MS = 60_000;

export function NotificationsBell() {
    const page = usePage();
    const sharedUnreadCount = page.props.notifications?.unread_count ?? 0;
    const [unreadCount, setUnreadCount] = useState(sharedUnreadCount);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const refreshUnreadCount = useCallback(() => {
        void fetchUnreadNotificationCount()
            .then(setUnreadCount)
            .catch(() => {
                // Ignore transient poll failures.
            });
    }, []);

    useEffect(() => {
        setUnreadCount(sharedUnreadCount);
    }, [sharedUnreadCount]);

    useEffect(() => {
        if (!page.props.auth.user) {
            return;
        }

        const poll = window.setInterval(
            refreshUnreadCount,
            UNREAD_POLL_INTERVAL_MS,
        );

        window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refreshUnreadCount);

        return () => {
            window.clearInterval(poll);
            window.removeEventListener(
                NOTIFICATIONS_UPDATED_EVENT,
                refreshUnreadCount,
            );
        };
    }, [page.props.auth.user, refreshUnreadCount]);

    const handleUnreadCountChange = useCallback((count: number) => {
        setUnreadCount(count);
    }, []);

    if (!page.props.auth.user) {
        return null;
    }

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton
                        type="button"
                        tooltip={{ children: 'Notifications' }}
                        onClick={() => setDrawerOpen(true)}
                        className="relative"
                        data-test="notifications-bell"
                    >
                        <Bell />
                        <span>Notifications</span>
                        {unreadCount > 0 ? (
                            <span
                                className={cn(
                                    'bg-primary text-primary-foreground absolute top-1.5 right-2 flex size-4 items-center justify-center rounded-full text-[10px] font-medium',
                                    'group-data-[collapsible=icon]:right-1',
                                )}
                            >
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        ) : null}
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>

            <NotificationsDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                onUnreadCountChange={handleUnreadCountChange}
            />
        </>
    );
}
