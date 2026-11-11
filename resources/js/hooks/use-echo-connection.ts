import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import {
    ensureEcho,
    getEchoConnectionState,
    isRealtimeEnabled,
    subscribeEchoConnection,
} from '@/lib/echo';
import type { EchoConnectionState } from '@/lib/echo';

/**
 * Boot Echo when realtime is enabled and expose the WebSocket connection state.
 */
export function useEchoConnection(): EchoConnectionState {
    const page = usePage();
    const enabled = isRealtimeEnabled(page.props.realtime);
    const isConnectionTracked = enabled && !!page.props.auth.user;
    const [state, setState] = useState<EchoConnectionState>(() =>
        enabled ? getEchoConnectionState() : 'disabled',
    );

    useEffect(() => {
        if (!isConnectionTracked) {
            return;
        }

        ensureEcho(true);

        return subscribeEchoConnection(setState);
    }, [isConnectionTracked]);

    // Derived rather than reset in the effect: the subscription replays the current state on re-enable.
    return isConnectionTracked ? state : 'disabled';
}
