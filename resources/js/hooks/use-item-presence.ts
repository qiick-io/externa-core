import { usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import {
    claimItemEditLock,
    joinItemPresence,
    leaveItemPresence,
    notifyItemSaved,
    releaseItemEditLock,
    subscribeItemPresence,
    takeOverItemEditLock,
} from '@/lib/item-presence';
import type { ItemPresenceSnapshot } from '@/lib/item-presence';

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
    notifySaved: (updatedAt: string) => void;
} {
    const page = usePage();
    const [snapshot, setSnapshot] =
        useState<ItemPresenceSnapshot>(emptySnapshot);
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
    // Keep the join baseline stable — re-joining on every save drops peer whispers (#315).
    const initialUpdatedAtRef = useRef(options.loadedUpdatedAt);

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
            loadedUpdatedAt: initialUpdatedAtRef.current,
        });

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
        realtimeOn,
    ]);

    useEffect(() => {
        if (
            !options.enabled ||
            !realtimeOn ||
            options.viewerId <= 0 ||
            !options.canClaimLock
        ) {
            return;
        }

        claimItemEditLock();
    }, [
        options.enabled,
        options.canClaimLock,
        options.viewerId,
        realtimeOn,
        options.collectionId,
        options.itemId,
    ]);

    return {
        ...snapshot,
        claimLock: claimItemEditLock,
        releaseLock: releaseItemEditLock,
        takeOverLock: takeOverItemEditLock,
        notifySaved: notifyItemSaved,
    };
}
