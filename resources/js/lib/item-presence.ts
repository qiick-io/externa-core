import type Echo from 'laravel-echo';
import {
    applyLockWhisper,
    buildLockClaim,
    isLockActive,
    ITEM_LOCK_TTL_MS,
    lockHeldByOther,
} from '@/lib/item-presence-lock';
import type { ItemLockState } from '@/lib/item-presence-lock';

export type ItemPresenceUser = {
    id: number;
    name?: string;
};

type EchoInstance = Echo<'reverb'>;

type PresenceChannel = {
    here: (cb: (users: ItemPresenceUser[]) => void) => PresenceChannel;
    joining: (cb: (user: ItemPresenceUser) => void) => PresenceChannel;
    leaving: (cb: (user: ItemPresenceUser) => void) => PresenceChannel;
    listenForWhisper: (
        event: string,
        cb: (data: Record<string, unknown>) => void,
    ) => PresenceChannel;
    whisper: (event: string, data: Record<string, unknown>) => void;
};

export type ItemPresenceSnapshot = {
    editors: ItemPresenceUser[];
    remoteUpdatedAt: string | null;
    lock: ItemLockState | null;
    lockedByOther: boolean;
};

const HEARTBEAT_MS = 10_000;

let editors: ItemPresenceUser[] = [];
let remoteUpdatedAt: string | null = null;
let lock: ItemLockState | null = null;
let viewerId = 0;
let viewerName = '';
let channelRef: PresenceChannel | null = null;
let activeChannelName: string | null = null;
let heartbeatTimer: number | null = null;
const listeners = new Set<(snapshot: ItemPresenceSnapshot) => void>();

function emit(): void {
    const snapshot: ItemPresenceSnapshot = {
        editors: [...editors],
        remoteUpdatedAt,
        lock,
        lockedByOther: lockHeldByOther(lock, viewerId),
    };
    listeners.forEach((listener) => listener(snapshot));
}

function syncEditors(users: ItemPresenceUser[]): void {
    editors = users.filter((user) => Number(user.id) !== viewerId);
    emit();
}

function whisperLock(state: ItemLockState | null): void {
    if (!channelRef) {
        return;
    }

    channelRef.whisper('item-lock', {
        userId: state?.userId ?? viewerId,
        name: state?.name ?? viewerName,
        until: state?.until ?? Date.now(),
    });
}

function whisperUpdatedAt(value: string): void {
    channelRef?.whisper('item-updated-at', {
        userId: viewerId,
        updatedAt: value,
    });
}

function startHeartbeat(): void {
    if (heartbeatTimer !== null) {
        return;
    }

    heartbeatTimer = window.setInterval(() => {
        if (!isLockActive(lock) || lock?.userId !== viewerId) {
            return;
        }

        const next = buildLockClaim(viewerId, viewerName);
        lock = next;
        whisperLock(next);
        emit();
    }, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

export function subscribeItemPresence(
    listener: (snapshot: ItemPresenceSnapshot) => void,
): () => void {
    listeners.add(listener);
    listener({
        editors: [...editors],
        remoteUpdatedAt,
        lock,
        lockedByOther: lockHeldByOther(lock, viewerId),
    });

    return () => {
        listeners.delete(listener);
    };
}

export function joinItemPresence(
    echo: EchoInstance,
    options: {
        collectionId: number;
        itemId: number;
        viewerId: number;
        viewerName: string;
        loadedUpdatedAt: string | null;
    },
): void {
    leaveItemPresence(echo);

    viewerId = options.viewerId;
    viewerName = options.viewerName;
    remoteUpdatedAt = options.loadedUpdatedAt;
    editors = [];
    lock = null;

    const channelName = `collection-item.${options.collectionId}.${options.itemId}`;
    activeChannelName = channelName;
    const channel = echo.join(channelName) as PresenceChannel;
    channelRef = channel;

    channel
        .here((users) => syncEditors(users))
        .joining((user) => {
            if (Number(user.id) === viewerId) {
                return;
            }

            editors = [...editors.filter((row) => row.id !== user.id), user];
            emit();
        })
        .leaving((user) => {
            editors = editors.filter((row) => row.id !== user.id);
            emit();
        });

    channel.listenForWhisper('item-lock', (payload) => {
        lock = applyLockWhisper(lock, payload);
        emit();
    });

    channel.listenForWhisper('item-updated-at', (payload) => {
        const next =
            typeof payload.updatedAt === 'string' ? payload.updatedAt : null;

        if (!next) {
            return;
        }

        remoteUpdatedAt = next;
        emit();
    });

    if (options.loadedUpdatedAt) {
        whisperUpdatedAt(options.loadedUpdatedAt);
    }

    emit();
    startHeartbeat();
}

export function leaveItemPresence(echo: EchoInstance | null): void {
    stopHeartbeat();

    if (channelRef && isLockActive(lock) && lock?.userId === viewerId) {
        whisperLock(null);
    }

    const channelName = activeChannelName;
    channelRef = null;
    activeChannelName = null;
    editors = [];
    lock = null;
    remoteUpdatedAt = null;

    if (channelName) {
        echo?.leave(channelName);
    }

    emit();
}

export function claimItemEditLock(): void {
    const next = buildLockClaim(viewerId, viewerName);
    lock = next;
    whisperLock(next);
    emit();
}

export function releaseItemEditLock(): void {
    if (lock?.userId !== viewerId) {
        return;
    }

    lock = null;
    whisperLock({ userId: viewerId, name: viewerName, until: Date.now() - 1 });
    emit();
}

export function takeOverItemEditLock(): void {
    claimItemEditLock();
}

export function notifyItemSaved(updatedAt: string): void {
    remoteUpdatedAt = updatedAt;
    whisperUpdatedAt(updatedAt);
    emit();
}

export function isRemoteUpdatedAtStale(
    baseline: string | null,
    remote: string | null,
): boolean {
    if (!baseline || !remote) {
        return false;
    }

    const baseMs = Date.parse(baseline);
    const remoteMs = Date.parse(remote);

    if (Number.isNaN(baseMs) || Number.isNaN(remoteMs)) {
        return false;
    }

    return remoteMs > baseMs;
}

/** Test helper — reset module state between node:test cases. */
export function resetItemPresenceForTests(): void {
    stopHeartbeat();
    channelRef = null;
    editors = [];
    remoteUpdatedAt = null;
    lock = null;
    viewerId = 0;
    viewerName = '';
    listeners.clear();
}

export { ITEM_LOCK_TTL_MS };
