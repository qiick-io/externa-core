import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

export type EchoConnectionState =
    | 'disabled'
    | 'connecting'
    | 'connected'
    | 'unavailable'
    | 'failed'
    | 'disconnected';

type EchoInstance = Echo<'reverb'>;

declare global {
    interface Window {
        Pusher: typeof Pusher;
        Echo?: EchoInstance;
    }
}

let echoInstance: EchoInstance | null = null;
let connectionState: EchoConnectionState = 'disabled';
const connectionListeners = new Set<(state: EchoConnectionState) => void>();

function setConnectionState(next: EchoConnectionState): void {
    if (connectionState === next) {
        return;
    }

    connectionState = next;
    connectionListeners.forEach((listener) => listener(next));
}

/**
 * Whether the shared Inertia payload says realtime broadcasting is on.
 */
export function isRealtimeEnabled(
    realtime?: { enabled?: boolean } | null,
): boolean {
    return realtime?.enabled === true;
}

/**
 * Lazily configure Laravel Echo for Reverb. No-op when realtime is disabled.
 */
export function ensureEcho(realtimeEnabled: boolean): EchoInstance | null {
    if (!realtimeEnabled) {
        setConnectionState('disabled');
        return null;
    }

    if (echoInstance) {
        return echoInstance;
    }

    const key = import.meta.env.VITE_REVERB_APP_KEY;
    if (!key) {
        setConnectionState('unavailable');
        return null;
    }

    window.Pusher = Pusher;
    setConnectionState('connecting');

    echoInstance = new Echo({
        broadcaster: 'reverb',
        key,
        wsHost: import.meta.env.VITE_REVERB_HOST,
        wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 80),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
        forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
        enabledTransports: ['ws', 'wss'],
        authEndpoint: '/broadcasting/auth',
    });

    window.Echo = echoInstance;

    const connection = (
        echoInstance.connector as {
            pusher?: {
                connection?: {
                    bind: (
                        event: string,
                        cb: (
                            state?: string | { current?: string },
                        ) => void,
                    ) => void;
                };
            };
        }
    ).pusher?.connection;

    connection?.bind('state_change', (states) => {
        const current =
            typeof states === 'object' && states && 'current' in states
                ? states.current
                : 'unavailable';
        if (current === 'connected') {
            setConnectionState('connected');
        } else if (current === 'connecting') {
            setConnectionState('connecting');
        } else if (current === 'failed') {
            setConnectionState('failed');
        } else if (current === 'unavailable') {
            setConnectionState('unavailable');
        } else {
            setConnectionState('disconnected');
        }
    });

    connection?.bind('connected', () => setConnectionState('connected'));
    connection?.bind('disconnected', () => setConnectionState('disconnected'));
    connection?.bind('unavailable', () => setConnectionState('unavailable'));
    connection?.bind('failed', () => setConnectionState('failed'));

    return echoInstance;
}

export function getEcho(): EchoInstance | null {
    return echoInstance;
}

export function getEchoConnectionState(): EchoConnectionState {
    return connectionState;
}

export function subscribeEchoConnection(
    listener: (state: EchoConnectionState) => void,
): () => void {
    connectionListeners.add(listener);
    listener(connectionState);

    return () => {
        connectionListeners.delete(listener);
    };
}
