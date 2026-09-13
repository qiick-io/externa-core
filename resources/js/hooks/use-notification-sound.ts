import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import {
    attachNotificationSoundUnlockListeners,
    setNotificationSoundPrefs,
    unlockNotificationSound,
} from '@/lib/notification-sound';
import type { NotificationSoundPrefs } from '@/lib/notification-sound';

/**
 * Sync shared prefs and unlock audio on first user gesture.
 */
export function useNotificationSound(): NotificationSoundPrefs {
    const page = usePage();
    const sounds = page.props.notificationSounds;

    useEffect(() => {
        if (sounds) {
            setNotificationSoundPrefs(sounds);

            // Enabling a toggle is a gesture opportunity — unlock early.
            if (
                sounds.sound_chat_enabled ||
                sounds.sound_notifications_enabled
            ) {
                unlockNotificationSound();
            }
        }
    }, [
        sounds?.sound_chat_enabled,
        sounds?.sound_notifications_enabled,
        sounds,
    ]);

    useEffect(() => attachNotificationSoundUnlockListeners(), []);

    return (
        sounds ?? {
            sound_chat_enabled: false,
            sound_notifications_enabled: false,
        }
    );
}
