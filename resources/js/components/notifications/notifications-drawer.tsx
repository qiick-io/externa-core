import { Link } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    markNotificationsRead,
    markNotificationsUnread,
    notifyNotificationsUpdated,
} from '@/lib/notifications-api';
import type { AppNotification } from '@/lib/notifications-api';
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
              : notification.data.type === 'chat' ||
                  notification.data.type === 'item_chat' ||
                  notification.data.type === 'item_comment'
                ? 'New message'
                : 'Notification')
    );
}

function notificationBody(notification: AppNotification): string {
    return notification.data.body ?? '';
}

function chatHref(notification: AppNotification): string | null {
    if (
        notification.data.type !== 'chat' &&
        notification.data.type !== 'item_chat' &&
        notification.data.type !== 'item_comment'
    ) {
        return null;
    }

    if (typeof notification.data.url === 'string') {
        return notification.data.url;
    }

    const collectionId = notification.data.collection_id;
    const itemId = notification.data.item_id;

    if (typeof collectionId === 'number' && typeof itemId === 'number') {
        return `/collections/${collectionId}/items/${itemId}?chat=1`;
    }

    return null;
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
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isMutating, setIsMutating] = useState(false);

    const hasUnread = notifications.some(
        (notification) => notification.read_at === null,
    );

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
    }, [open]);

    const applyUnreadCount = (unreadCount: number): void => {
        onUnreadCountChange(unreadCount);
        notifyNotificationsUpdated();
    };

    const handleMarkAllRead = async (): Promise<void> => {
        if (isMutating || !hasUnread) {
            return;
        }

        setIsMutating(true);

        try {
            const unreadCount = await markNotificationsRead({ all: true });
            setNotifications((current) =>
                current.map((notification) => ({
                    ...notification,
                    read_at: notification.read_at ?? new Date().toISOString(),
                })),
            );
            applyUnreadCount(unreadCount);
        } finally {
            setIsMutating(false);
        }
    };

    const handleMarkUnread = async (id: string): Promise<void> => {
        if (isMutating) {
            return;
        }

        setIsMutating(true);

        try {
            const unreadCount = await markNotificationsUnread([id]);
            setNotifications((current) =>
                current.map((notification) =>
                    notification.id === id
                        ? { ...notification, read_at: null }
                        : notification,
                ),
            );
            applyUnreadCount(unreadCount);
        } finally {
            setIsMutating(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{t('notifications.title')}</SheetTitle>
                    <SheetDescription>
                        {t('notifications.description')}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex items-center justify-end px-4 pb-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isMutating || isLoading || !hasUnread}
                        onClick={() => void handleMarkAllRead()}
                        data-test="notifications-mark-all-read"
                    >
                        {t('notifications.markAllRead')}
                    </Button>
                </div>

                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">
                            {t('notifications.loading')}
                        </p>
                    ) : null}

                    {!isLoading && notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('notifications.empty')}
                        </p>
                    ) : null}

                    {notifications.map((notification) => {
                        const folderId = notification.data.folder_id;
                        const zipHref = zipDownloadHref(notification);
                        const chatUrl = chatHref(notification);
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
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {notificationBody(notification)}
                                    </p>
                                ) : null}
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {new Date(
                                        notification.created_at,
                                    ).toLocaleString()}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {typeof folderId === 'number' ? (
                                        <Button
                                            asChild
                                            variant="link"
                                            className="h-auto px-0"
                                        >
                                            <Link
                                                href={adminRoutes.files.index(
                                                    folderId,
                                                )}
                                                onClick={() =>
                                                    onOpenChange(false)
                                                }
                                            >
                                                {t('notifications.openFolder')}
                                            </Link>
                                        </Button>
                                    ) : null}
                                    {chatUrl ? (
                                        <Button
                                            asChild
                                            variant="link"
                                            className="h-auto px-0"
                                        >
                                            <Link
                                                href={chatUrl}
                                                onClick={() =>
                                                    onOpenChange(false)
                                                }
                                            >
                                                {t('notifications.openChat')}
                                            </Link>
                                        </Button>
                                    ) : null}
                                    {zipHref ? (
                                        <Button
                                            asChild
                                            variant="link"
                                            className="h-auto px-0"
                                        >
                                            <a
                                                href={zipHref}
                                                onClick={() =>
                                                    onOpenChange(false)
                                                }
                                            >
                                                {t('notifications.downloadZip')}
                                            </a>
                                        </Button>
                                    ) : null}
                                    {!isUnread ? (
                                        <Button
                                            type="button"
                                            variant="link"
                                            className="h-auto px-0"
                                            disabled={isMutating}
                                            onClick={() =>
                                                void handleMarkUnread(
                                                    notification.id,
                                                )
                                            }
                                            data-test="notifications-mark-unread"
                                        >
                                            {t('notifications.markUnread')}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
