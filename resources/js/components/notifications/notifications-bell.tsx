import { usePage } from '@inertiajs/react';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NotificationsDrawer } from '@/components/notifications/notifications-drawer';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import {
    fetchUnreadNotificationCount,
    NOTIFICATIONS_UPDATED_EVENT,
} from '@/lib/notifications-api';
import { SidebarUnreadBadge } from '@/components/sidebar-unread-badge';

const UNREAD_POLL_INTERVAL_MS = 60_000;

/**
 * Sidebar bell trigger for the notifications drawer.
 */
export function NotificationsBell() {
    const page = usePage();
    const sharedUnreadCount = page.props.notifications?.unread_count ?? 0;
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
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
        const user = page.props.auth.user;

        if (!user) {
            return;
        }

        window.addEventListener(
            NOTIFICATIONS_UPDATED_EVENT,
            refreshUnreadCount,
        );

        let poll: number | undefined;

        if (!realtimeOn) {
            // Fallback when BROADCAST_CONNECTION=log/null
            poll = window.setInterval(
                refreshUnreadCount,
                UNREAD_POLL_INTERVAL_MS,
            );
        } else {
            const echo = ensureEcho(true);
            echo?.private(`App.Models.User.${user.id}`).notification(() => {
                setUnreadCount((count) => count + 1);
                window.dispatchEvent(
                    new CustomEvent(NOTIFICATIONS_UPDATED_EVENT),
                );
            });
        }

        return () => {
            if (poll) {
                window.clearInterval(poll);
            }

            window.removeEventListener(
                NOTIFICATIONS_UPDATED_EVENT,
                refreshUnreadCount,
            );

            if (realtimeOn) {
                ensureEcho(true)?.leave(`App.Models.User.${user.id}`);
            }
        };
    }, [page.props.auth.user, realtimeOn, refreshUnreadCount]);

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
                        <SidebarUnreadBadge count={unreadCount} />
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
