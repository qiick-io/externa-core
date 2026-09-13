import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { isRealtimeEnabled } from '@/lib/echo';
import { subscribeOnlineUsers } from '@/lib/online-presence';

/**
 * Read currently online user ids from the shared presence channel state.
 */
export function useOnlineUsers(): Set<number> {
    const page = usePage();
    const enabled =
        isRealtimeEnabled(page.props.realtime) && !!page.props.auth.user;
    const [onlineIds, setOnlineIds] = useState<Set<number>>(() => new Set());

    useEffect(() => {
        if (!enabled) {
            setOnlineIds(new Set());

            return;
        }

        return subscribeOnlineUsers(setOnlineIds);
    }, [enabled]);

    return onlineIds;
}
