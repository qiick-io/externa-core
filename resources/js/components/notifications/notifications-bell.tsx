import { usePage } from '@inertiajs/react';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationsDrawer } from '@/components/notifications/notifications-drawer';
import { SidebarUnreadBadge } from '@/components/sidebar-unread-badge';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import { playNotificationSound } from '@/lib/notification-sound';
import {
    fetchUnreadNotificationCount,
    NOTIFICATIONS_UPDATED_EVENT,
} from '@/lib/notifications-api';

const UNREAD_POLL_INTERVAL_MS = 60_000;

/**
 * Sidebar bell trigger for the notifications drawer.
 */
export function NotificationsBell() {
    const { t } = useTranslation();
    const page = usePage();
    const sharedUnreadCount = page.props.notifications?.unread_count ?? 0;
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
    const [unreadCount, setUnreadCount] = useState(sharedUnreadCount);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const drawerOpenRef = useRef(drawerOpen);

    useEffect(() => {
        drawerOpenRef.current = drawerOpen;
    }, [drawerOpen]);

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
            const channel = echo?.private(`App.Models.User.${user.id}`);
            const notificationEvent =
                '.Illuminate\\Notifications\\Events\\BroadcastNotificationCreated';

            channel?.stopListening(notificationEvent);
            channel?.listen(notificationEvent, () => {
                setUnreadCount((count) => count + 1);
                window.dispatchEvent(
                    new CustomEvent(NOTIFICATIONS_UPDATED_EVENT),
                );

                if (!drawerOpenRef.current) {
                    playNotificationSound();
                }
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
                ensureEcho(true)
                    ?.private(`App.Models.User.${user.id}`)
                    .stopListening(
                        '.Illuminate\\Notifications\\Events\\BroadcastNotificationCreated',
                    );
            }
        };
    }, [page.props.auth.user, realtimeOn, refreshUnreadCount]);

    const handleUnreadCountChange = useCallback((count: number) => {
        setUnreadCount(count);
    }, []);

    if (!page.props.auth.user) {
        return null;
    }

    const notificationsLabel =
        unreadCount > 0
            ? t('a11y.notificationsUnread', { count: unreadCount })
            : t('a11y.notifications');

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton
                        type="button"
                        tooltip={{ children: t('a11y.notifications') }}
                        onClick={() => setDrawerOpen(true)}
                        className="relative"
                        data-test="notifications-bell"
                        aria-label={notificationsLabel}
                        aria-expanded={drawerOpen}
                        aria-haspopup="dialog"
                    >
                        <Bell aria-hidden="true" />
                        <span>{t('a11y.notifications')}</span>
                        <SidebarUnreadBadge count={unreadCount} decorative />
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
