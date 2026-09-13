import { useNotificationSound } from '@/hooks/use-notification-sound';

/**
 * Mount prefs sync + gesture unlock for notification/chat sounds.
 * Live chat play lives in use-chat-unread (sole ChatUnreadUpdated listener).
 * Live notification play lives in notifications-bell Echo handler.
 */
export function NotificationSoundTracker() {
    useNotificationSound();

    return null;
}
