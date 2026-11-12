import {
    useCallback,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fetchMessages,
    markChatRead,
    stopChatViewing,
} from '@/lib/item-chat-api';
import type { ChatScope } from '@/lib/item-chat-api';
import { useChatStore } from '@/stores/chat/store';
import { mergeLatestPage } from '@/stores/chat/types';

type UseChatFeedOptions = {
    open: boolean;
    collectionId?: number;
    itemId?: number;
    chatId: string | null;
    variant: 'drawer' | 'pane';
    /** Kept in sync with the live chat id, for callbacks that outlive a render. */
    liveChatIdRef: RefObject<string | null>;
    onChatCountChangeRef: RefObject<(count: number) => void>;
    /** Oldest loaded message before "Load older", to keep it in view after the prepend. */
    olderAnchorIdRef: RefObject<number | null>;
};

/**
 * Message feed of one chat thread: resolves the scope (hub chat id, or the item alias
 * until the first page returns a chat id), loads the latest page and older pages into
 * the shared chat store, marks the thread read while it is open and tells the server
 * the viewer left on close.
 *
 * A soft refresh keeps the cached page visible; a load-older request has its own
 * generation counter so a refresh never cancels it.
 */
export function useChatFeed({
    open,
    collectionId,
    itemId,
    chatId,
    variant,
    liveChatIdRef,
    onChatCountChangeRef,
    olderAnchorIdRef,
}: UseChatFeedOptions) {
    const { t } = useTranslation();
    const [liveChatId, setLiveChatId] = useState<string | null>(chatId);
    const scope = useMemo<ChatScope | null>(() => {
        if (liveChatId) {
            return { mode: 'hub', chatId: liveChatId };
        }

        if (collectionId && itemId) {
            return { mode: 'item', collectionId, itemId };
        }

        return null;
    }, [liveChatId, collectionId, itemId]);

    const messagesEntry = useChatStore((state) =>
        liveChatId ? state.messagesByChatId[liveChatId] : undefined,
    );
    const messages = useMemo(
        () => messagesEntry?.messages ?? [],
        [messagesEntry?.messages],
    );
    const hasMore = messagesEntry?.hasMore ?? false;
    const pinned = messagesEntry?.pinned ?? [];
    const setMessagesCache = useChatStore((state) => state.setMessagesCache);
    const prependOlderMessages = useChatStore(
        (state) => state.prependOlderMessages,
    );
    const touchMessages = useChatStore((state) => state.touchMessages);

    const [notify, setNotify] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pageLoadGen = useRef(0);
    const olderLoadGen = useRef(0);

    useLayoutEffect(() => {
        liveChatIdRef.current = liveChatId;
    });

    const scopeKey =
        scope?.mode === 'hub'
            ? `hub:${scope.chatId}`
            : scope
              ? `item:${scope.collectionId}:${scope.itemId}`
              : null;

    const load = useCallback(
        (beforeId?: number): void => {
            const cachedId = liveChatIdRef.current;
            const cachedLen = cachedId
                ? (useChatStore.getState().messagesByChatId[cachedId]?.messages
                      .length ?? 0)
                : 0;

            if (beforeId) {
                setLoadingMore(true);
            } else if (cachedLen === 0) {
                setLoading(true);
            }

            if (!scope) {
                setLoading(false);
                setLoadingMore(false);

                return;
            }

            // Separate gens: soft refresh must not cancel in-flight load-older.
            const gen = beforeId
                ? ++olderLoadGen.current
                : ++pageLoadGen.current;
            const isStale = (): boolean =>
                beforeId
                    ? gen !== olderLoadGen.current
                    : gen !== pageLoadGen.current;
            setError(null);

            void fetchMessages(scope, { beforeId })
                .then((payload) => {
                    if (isStale()) {
                        return;
                    }

                    setNotify(payload.meta.notify);
                    onChatCountChangeRef.current(payload.meta.total);

                    const nextChatId =
                        payload.meta.chat_id ?? liveChatIdRef.current;

                    if (payload.meta.chat_id) {
                        setLiveChatId(payload.meta.chat_id);
                    }

                    if (!nextChatId) {
                        return;
                    }

                    if (beforeId) {
                        prependOlderMessages(
                            nextChatId,
                            payload.messages,
                            payload.meta.has_more,
                        );
                    } else {
                        const prev =
                            useChatStore.getState().messagesByChatId[
                                nextChatId
                            ];
                        const merged = mergeLatestPage(
                            prev?.messages ?? [],
                            payload.messages,
                            prev?.hasMore ?? false,
                            payload.meta.has_more,
                        );
                        setMessagesCache(nextChatId, {
                            messages: merged.messages,
                            hasMore: merged.hasMore,
                            pinned: payload.pinned ?? [],
                        });
                    }
                })
                .catch(() => {
                    if (isStale()) {
                        return;
                    }

                    if (beforeId) {
                        olderAnchorIdRef.current = null;
                    }

                    setError(t('collections.itemChat.error'));

                    // Only wipe on cold first-page failure (no cache yet).
                    if (!beforeId && liveChatIdRef.current && cachedLen === 0) {
                        setMessagesCache(liveChatIdRef.current, {
                            messages: [],
                            hasMore: false,
                            pinned: [],
                        });
                    }
                })
                .finally(() => {
                    if (isStale()) {
                        return;
                    }

                    if (beforeId) {
                        setLoadingMore(false);
                    } else {
                        setLoading(false);
                    }
                });
        },
        [
            scope,
            t,
            prependOlderMessages,
            setMessagesCache,
            liveChatIdRef,
            onChatCountChangeRef,
            olderAnchorIdRef,
        ],
    );

    useEffect(() => {
        // oxlint-disable-next-line react/set-state-in-effect -- moved as is from item-chat-drawer.tsx (#283), where the compiler skipped it; moving the reset out of the effect changes render timing (#671)
        setLiveChatId(chatId);
    }, [chatId]);

    // Runs with the latest `load`; the effect below re-runs only when the thread changes.
    const loadOpenedThread = useEffectEvent((): void => {
        const id = chatId ?? liveChatIdRef.current;
        const cached = id
            ? useChatStore.getState().messagesByChatId[id]
            : undefined;

        if (cached?.status === 'ready') {
            touchMessages(id!);
            setLoading(false);
            load(); // soft refresh; keep cache visible
        } else {
            setLoading(true);
            load();
        }
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        loadOpenedThread();
    }, [open, scopeKey]);

    useEffect(() => {
        if (!open || !scope) {
            return;
        }

        // Hub pane: ChatPageController already markRead + rememberViewer on show.
        if (variant !== 'pane') {
            void markChatRead(scope).catch(() => {
                // Missing thread (item alias before first message) is a no-op.
            });
        }

        return () => {
            void stopChatViewing(scope).catch(() => {
                // Ignore; viewer TTL will expire.
            });
        };
    }, [open, scope, scopeKey, variant]);

    /** "Load older": remembers the oldest message so it stays in view after the prepend. */
    const loadOlder = (): void => {
        const oldestId = messages[0]?.id;

        if (!oldestId || loadingMore) {
            return;
        }

        olderAnchorIdRef.current = oldestId;
        load(oldestId);
    };

    return {
        liveChatId,
        scope,
        scopeKey,
        messages,
        hasMore,
        pinned,
        notify,
        setNotify,
        loading,
        loadingMore,
        error,
        setError,
        load,
        loadOlder,
    };
}
