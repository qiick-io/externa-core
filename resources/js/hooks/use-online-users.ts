import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';

type PresenceUser = {
    id: number;
    name?: string;
};

/**
 * Join the admin presence channel and track currently online user ids.
 */
export function useOnlineUsers(): Set<number> {
    const page = usePage();
    const enabled = isRealtimeEnabled(page.props.realtime);
    const [onlineIds, setOnlineIds] = useState<Set<number>>(() => new Set());

    useEffect(() => {
        if (!enabled || !page.props.auth.user) {
            setOnlineIds(new Set());
            return;
        }

        const echo = ensureEcho(true);
        if (!echo) {
            return;
        }

        const channel = echo.join('online')
            .here((users: PresenceUser[]) => {
                setOnlineIds(new Set(users.map((user) => Number(user.id))));
            })
            .joining((user: PresenceUser) => {
                setOnlineIds((prev) => {
                    const next = new Set(prev);
                    next.add(Number(user.id));
                    return next;
                });
            })
            .leaving((user: PresenceUser) => {
                setOnlineIds((prev) => {
                    const next = new Set(prev);
                    next.delete(Number(user.id));
                    return next;
                });
            });

        return () => {
            echo.leave('online');
            void channel;
        };
    }, [enabled, page.props.auth.user]);

    return onlineIds;
}
