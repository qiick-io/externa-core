import { usePage } from '@inertiajs/react';
import { useCallback, useEffect } from 'react';
import {
    fetchChatUnread,
    type ChatSummary,
    type ChatUnreadShare,
} from '@/lib/chat-hub-api';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import {
    playChatSound,
    shouldPlayChatSoundForUnreadEvent,
} from '@/lib/notification-sound';
import { useChatStore } from '@/stores/chat/store';
import { emptyUnread, isUnreadShare } from '@/stores/chat/types';

const UNREAD_POLL_INTERVAL_MS = 60_000;

let echoUserId: number | null = null;

const CHAT_UNREAD_EVENT = '.ChatUnreadUpdated';
const CHAT_THREAD_UPSERTED_EVENT = '.ThreadUpserted';

function isChatSummary(value: unknown): value is ChatSummary {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const row = value as ChatSummary;

    return (
        typeof row.id === 'string' &&
        (row.kind === 'direct' || row.kind === 'item') &&
        typeof row.title === 'string'
    );
}

function onChatUnreadUpdated(payload: ChatUnreadShare): void {
    if (!isUnreadShare(payload)) {
        return;
    }

    const store = useChatStore.getState();
    const previousUnread = store.unread.unread_count;

    store.setUnread(payload);

    if (
        typeof payload.chat_id === 'string' &&
        payload.chat_id !== '' &&
        typeof payload.chat_unread_count === 'number'
    ) {
        store.patchThread(payload.chat_id, {
            unread_count: payload.chat_unread_count,
        });
    }

    if (
        shouldPlayChatSoundForUnreadEvent(
            previousUnread,
            payload.unread_count,
            payload.play_sound,
        )
    ) {
        playChatSound();
    }
}

function onChatThreadUpserted(payload: { chat?: unknown }): void {
    if (!isChatSummary(payload.chat)) {
        return;
    }

    useChatStore.getState().upsertThread(payload.chat);
}

/** Re-bind listener; shared user channel also used by notifications bell. */
function bindUnreadEcho(userId: number): void {
    const echo = ensureEcho(true);

    if (!echo) {
        return;
    }

    if (echoUserId !== null && echoUserId !== userId) {
        echo
            .private(`App.Models.User.${echoUserId}`)
            .stopListening(CHAT_UNREAD_EVENT)
            .stopListening(CHAT_THREAD_UPSERTED_EVENT);
    }

    echo
        .private(`App.Models.User.${userId}`)
        .stopListening(CHAT_UNREAD_EVENT)
        .stopListening(CHAT_THREAD_UPSERTED_EVENT)
        .listen(CHAT_UNREAD_EVENT, onChatUnreadUpdated)
        .listen(CHAT_THREAD_UPSERTED_EVENT, onChatThreadUpserted);
    echoUserId = userId;
}

/**
 * Shared chat unread totals for sidebar + hub tabs (Zustand).
 */
export function useChatUnread(): ChatUnreadShare & { refresh: () => void } {
    const page = usePage();
    const shared = page.props.chat ?? emptyUnread();
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
    const unread = useChatStore((state) => state.unread);
    const setUnread = useChatStore((state) => state.setUnread);

    const refresh = useCallback((): void => {
        void fetchChatUnread()
            .then(setUnread)
            .catch(() => {
                // Ignore transient poll failures.
            });
    }, [setUnread]);

    useEffect(() => {
        setUnread(shared);
    }, [
        shared.unread_count,
        shared.unread_private,
        shared.unread_collection,
        setUnread,
    ]);

    useEffect(() => {
        const user = page.props.auth.user;

        if (!user) {
            echoUserId = null;

            return;
        }

        if (!realtimeOn) {
            const poll = window.setInterval(refresh, UNREAD_POLL_INTERVAL_MS);

            return () => window.clearInterval(poll);
        }

        bindUnreadEcho(user.id);

        return;
    }, [page.props.auth.user, realtimeOn, refresh]);

    return { ...unread, refresh };
}
