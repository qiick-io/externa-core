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
    const [state, setState] = useState<EchoConnectionState>(() =>
        enabled ? getEchoConnectionState() : 'disabled',
    );

    useEffect(() => {
        if (!enabled || !page.props.auth.user) {
            setState('disabled');

            return;
        }

        ensureEcho(true);

        return subscribeEchoConnection(setState);
    }, [enabled, page.props.auth.user]);

    return state;
}
