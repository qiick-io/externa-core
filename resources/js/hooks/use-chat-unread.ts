import { usePage } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';
import {
    CHAT_UNREAD_UPDATED_EVENT,
    fetchChatUnread,
    type ChatUnreadShare,
} from '@/lib/chat-hub-api';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';

const UNREAD_POLL_INTERVAL_MS = 60_000;

let echoBoundUserId: number | null = null;

function emptyUnread(): ChatUnreadShare {
    return {
        unread_count: 0,
        unread_private: 0,
        unread_collection: 0,
    };
}

function isUnreadShare(value: unknown): value is ChatUnreadShare {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const row = value as ChatUnreadShare;

    return (
        typeof row.unread_count === 'number' &&
        typeof row.unread_private === 'number' &&
        typeof row.unread_collection === 'number'
    );
}

/**
 * Shared chat unread totals for sidebar + hub tabs.
 */
export function useChatUnread(): ChatUnreadShare & { refresh: () => void } {
    const page = usePage();
    const shared = page.props.chat ?? emptyUnread();
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
    const [unread, setUnread] = useState<ChatUnreadShare>(shared);

    const refresh = useCallback((): void => {
        void fetchChatUnread()
            .then(setUnread)
            .catch(() => {
                // Ignore transient poll failures.
            });
    }, []);

    useEffect(() => {
        setUnread(shared);
    }, [
        shared.unread_count,
        shared.unread_private,
        shared.unread_collection,
    ]);

    useEffect(() => {
        const onUpdate = (event: Event): void => {
            const detail = (event as CustomEvent<ChatUnreadShare>).detail;
            if (isUnreadShare(detail)) {
                setUnread(detail);
            } else {
                refresh();
            }
        };

        window.addEventListener(CHAT_UNREAD_UPDATED_EVENT, onUpdate);

        let poll: number | undefined;
        const user = page.props.auth.user;

        if (!user) {
            return () => {
                window.removeEventListener(CHAT_UNREAD_UPDATED_EVENT, onUpdate);
            };
        }

        if (!realtimeOn) {
            poll = window.setInterval(refresh, UNREAD_POLL_INTERVAL_MS);
        } else if (echoBoundUserId !== user.id) {
            const echo = ensureEcho(true);
            echo
                ?.private(`App.Models.User.${user.id}`)
                .listen('.ChatUnreadUpdated', (payload: ChatUnreadShare) => {
                    if (isUnreadShare(payload)) {
                        setUnread(payload);
                        window.dispatchEvent(
                            new CustomEvent(CHAT_UNREAD_UPDATED_EVENT, {
                                detail: payload,
                            }),
                        );
                    }
                });
            echoBoundUserId = user.id;
        }

        return () => {
            if (poll) {
                window.clearInterval(poll);
            }

            window.removeEventListener(CHAT_UNREAD_UPDATED_EVENT, onUpdate);
        };
    }, [page.props.auth.user, realtimeOn, refresh]);

    return { ...unread, refresh };
}
