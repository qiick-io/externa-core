import { Link } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import adminRoutes from '@/lib/admin-routes';
import { downloadPreparedZipUrl } from '@/lib/files-api';
import {
    fetchNotifications,
    markNotificationsRead
    
} from '@/lib/notifications-api';
import type {AppNotification} from '@/lib/notifications-api';
import { cn } from '@/lib/utils';

type NotificationsDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUnreadCountChange: (count: number) => void;
};

function notificationTitle(notification: AppNotification): string {
    return (
        notification.data.title ??
        (notification.data.type === 'file_duplication_failed'
            ? 'File duplication failed'
            : notification.data.type === 'file_zip_failed'
              ? 'Zip preparation failed'
              : 'Notification')
    );
}

function notificationBody(notification: AppNotification): string {
    return notification.data.body ?? '';
}

function zipDownloadHref(notification: AppNotification): string | null {
    if (notification.data.type !== 'file_zip_ready') {
        return null;
    }

    if (typeof notification.data.download_url === 'string') {
        return notification.data.download_url;
    }

    if (typeof notification.data.job_id === 'string') {
        return downloadPreparedZipUrl(notification.data.job_id);
    }

    return null;
}

/**
 * Drawer listing user notifications.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function NotificationsDrawer({
    open,
    onOpenChange,
    onUnreadCountChange,
}: NotificationsDrawerProps) {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        let cancelled = false;

        const load = async (): Promise<void> => {
            setIsLoading(true);

            try {
                const payload = await fetchNotifications(1);

                if (cancelled) {
                    return;
                }

                setNotifications(payload.data);

                const unreadIds = payload.data
                    .filter((notification) => notification.read_at === null)
                    .map((notification) => notification.id);

                if (unreadIds.length > 0) {
                    const unreadCount = await markNotificationsRead({
                        ids: unreadIds,
                    });

                    if (!cancelled) {
                        onUnreadCountChange(unreadCount);
                        setNotifications((current) =>
                            current.map((notification) =>
                                unreadIds.includes(notification.id)
                                    ? {
                                          ...notification,
                                          read_at:
                                              notification.read_at ??
                                              new Date().toISOString(),
                                      }
                                    : notification,
                            ),
                        );
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [open, onUnreadCountChange]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Notifications</SheetTitle>
                    <SheetDescription>
                        Updates from background file operations.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
                    {isLoading ? (
                        <p className="text-muted-foreground text-sm">
                            Loading…
                        </p>
                    ) : null}

                    {!isLoading && notifications.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No notifications yet.
                        </p>
                    ) : null}

                    {notifications.map((notification) => {
                        const folderId = notification.data.folder_id;
                        const zipHref = zipDownloadHref(notification);
                        const isUnread = notification.read_at === null;

                        return (
                            <div
                                key={notification.id}
                                className={cn(
                                    'rounded-lg border p-3',
                                    isUnread && 'bg-muted/40',
                                )}
                            >
                                <p className="text-sm font-medium">
                                    {notificationTitle(notification)}
                                </p>
                                {notificationBody(notification) ? (
                                    <p className="text-muted-foreground mt-1 text-sm">
                                        {notificationBody(notification)}
                                    </p>
                                ) : null}
                                <p className="text-muted-foreground mt-2 text-xs">
                                    {new Date(
                                        notification.created_at,
                                    ).toLocaleString()}
                                </p>
                                {typeof folderId === 'number' ? (
                                    <Button
                                        asChild
                                        variant="link"
                                        className="mt-1 h-auto px-0"
                                    >
                                        <Link
                                            href={adminRoutes.files.index(
                                                folderId,
                                            )}
                                            onClick={() => onOpenChange(false)}
                                        >
                                            Open folder
                                        </Link>
                                    </Button>
                                ) : null}
                                {zipHref ? (
                                    <Button
                                        asChild
                                        variant="link"
                                        className="mt-1 h-auto px-0"
                                    >
                                        <a
                                            href={zipHref}
                                            onClick={() => onOpenChange(false)}
                                        >
                                            Download zip
                                        </a>
                                    </Button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
