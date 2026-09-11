import type Echo from 'laravel-echo';

type PresenceUser = {
    id: number;
    name?: string;
};

type EchoInstance = Echo<'reverb'>;

let onlineIds = new Set<number>();
const listeners = new Set<(ids: Set<number>) => void>();
let joined = false;

function emit(): void {
    const snapshot = new Set(onlineIds);
    listeners.forEach((listener) => listener(snapshot));
}

function syncFromHere(users: PresenceUser[]): void {
    onlineIds = new Set(users.map((user) => Number(user.id)));
    emit();
}

function addUser(user: PresenceUser): void {
    onlineIds = new Set([...onlineIds, Number(user.id)]);
    emit();
}

function removeUser(user: PresenceUser): void {
    const next = new Set(onlineIds);
    next.delete(Number(user.id));
    onlineIds = next;
    emit();
}

/**
 * Subscribe to the shared online-user id set (updated by presence events).
 */
export function subscribeOnlineUsers(
    listener: (ids: Set<number>) => void,
): () => void {
    listeners.add(listener);
    listener(new Set(onlineIds));

    return () => {
        listeners.delete(listener);
    };
}

/**
 * Join the global presence channel once per Echo session.
 */
export function joinOnlinePresence(echo: EchoInstance): void {
    if (joined) {
        return;
    }

    joined = true;

    echo.join('online').here(syncFromHere).joining(addUser).leaving(removeUser);
}

/**
 * Leave presence and reset tracked ids (logout / realtime disabled).
 */
export function leaveOnlinePresence(echo: EchoInstance | null): void {
    if (!joined) {
        return;
    }

    joined = false;
    echo?.leave('online');
    onlineIds = new Set();
    emit();
}

/** Test helper — reset module state between node:test cases. */
export function resetOnlinePresenceForTests(): void {
    joined = false;
    onlineIds = new Set();
    listeners.clear();
}
