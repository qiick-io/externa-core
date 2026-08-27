import { usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import { joinOnlinePresence, leaveOnlinePresence } from '@/lib/online-presence';

/**
 * Keeps the shared online presence channel joined for the authenticated session.
 * Mount once in the app shell so every logged-in tab counts as online.
 */
export function OnlinePresenceTracker() {
    const page = usePage();
    const enabled = isRealtimeEnabled(page.props.realtime);
    const userId = page.props.auth.user?.id;

    useEffect(() => {
        if (!enabled || !userId) {
            leaveOnlinePresence(null);

            return;
        }

        const echo = ensureEcho(true);

        if (!echo) {
            return;
        }

        joinOnlinePresence(echo);

        return () => {
            leaveOnlinePresence(echo);
        };
    }, [enabled, userId]);

    return null;
}
