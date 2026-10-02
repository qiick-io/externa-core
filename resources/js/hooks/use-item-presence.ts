import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import {
    claimItemEditLock,
    joinItemPresence,
    leaveItemPresence,
    releaseItemEditLock,
    subscribeItemPresence,
    takeOverItemEditLock,
    type ItemPresenceSnapshot,
} from '@/lib/item-presence';

const emptySnapshot: ItemPresenceSnapshot = {
    editors: [],
    remoteUpdatedAt: null,
    lock: null,
    lockedByOther: false,
};

export function useItemPresence(options: {
    enabled: boolean;
    collectionId: number;
    itemId: number;
    viewerId: number;
    viewerName: string;
    loadedUpdatedAt: string | null;
    canClaimLock: boolean;
}): ItemPresenceSnapshot & {
    claimLock: () => void;
    releaseLock: () => void;
    takeOverLock: () => void;
} {
    const page = usePage();
    const [snapshot, setSnapshot] =
        useState<ItemPresenceSnapshot>(emptySnapshot);
    const realtimeOn = isRealtimeEnabled(page.props.realtime);

    useEffect(() => {
        if (!options.enabled || !realtimeOn || options.viewerId <= 0) {
            setSnapshot(emptySnapshot);

            return;
        }

        const echo = ensureEcho(true);

        if (!echo) {
            return;
        }

        joinItemPresence(echo, {
            collectionId: options.collectionId,
            itemId: options.itemId,
            viewerId: options.viewerId,
            viewerName: options.viewerName,
            loadedUpdatedAt: options.loadedUpdatedAt,
        });

        if (options.canClaimLock) {
            claimItemEditLock();
        }

        const unsubscribe = subscribeItemPresence(setSnapshot);

        return () => {
            unsubscribe();
            leaveItemPresence(echo);
        };
    }, [
        options.enabled,
        options.collectionId,
        options.itemId,
        options.viewerId,
        options.viewerName,
        options.loadedUpdatedAt,
        options.canClaimLock,
        realtimeOn,
    ]);

    return {
        ...snapshot,
        claimLock: claimItemEditLock,
        releaseLock: releaseItemEditLock,
        takeOverLock: takeOverItemEditLock,
    };
}
