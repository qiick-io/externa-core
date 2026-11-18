import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ensureEcho } from '@/lib/echo';
import { markChatRead } from '@/lib/item-chat-api';
import type {
    ChatPinned,
    ChatScope,
    ItemChatMessage,
} from '@/lib/item-chat-api';
import { applyReactionToggle } from '@/lib/item-chat-reactions';
import { useChatStore } from '@/stores/chat/store';

const TYPING_EXPIRE_MS = 2500;
const WHISPER_THROTTLE_MS = 500;

type UseChatRealtimeOptions = {
    open: boolean;
    realtimeOn: boolean;
    liveChatId: string | null;
    scope: ChatScope | null;
    scopeKey: string | null;
    viewerId: number;
    viewerName: string;
    /** Loaded messages, to name typists whose whisper carried no name. */
    messages: ItemChatMessage[];
    liveChatIdRef: RefObject<string | null>;
    chatCountRef: RefObject<number>;
    /**
     * Ids of deleted messages already taken off the count, shared with the delete
     * action so its reply and this tab's `MessageDeleted` echo lower it only once.
     */
    countedDeletionIdsRef: RefObject<Set<number>>;
    onChatCountChangeRef: RefObject<(count: number) => void>;
    forceScrollBottomRef: RefObject<boolean>;
    /** Removes the optimistic bubble an own `MessageCreated` stands for. */
    dropEchoedPending: (message: ItemChatMessage) => void;
};

/**
 * Realtime side of one chat thread over the `chat.{id}` presence channel: applies
 * `MessageCreated`, `MessageUpdated`, `MessageDeleted` and `ReactionToggled` to the
 * shared chat store, keeps the thread list preview and the count in step, and tracks
 * who is typing through `typing` whispers (expired after 2.5 s).
 *
 * Without realtime (or before the thread has a chat id) it does nothing and
 * `whisperTyping` is a no-op.
 */
export function useChatRealtime({
    open,
    realtimeOn,
    liveChatId,
    scope,
    scopeKey,
    viewerId,
    viewerName,
    messages,
    liveChatIdRef,
    chatCountRef,
    countedDeletionIdsRef,
    onChatCountChangeRef,
    forceScrollBottomRef,
    dropEchoedPending,
}: UseChatRealtimeOptions) {
    const appendMessage = useChatStore((state) => state.appendMessage);
    const replaceMessage = useChatStore((state) => state.replaceMessage);
    const removeCachedMessage = useChatStore((state) => state.removeMessage);
    const mapMessages = useChatStore((state) => state.mapMessages);
    const mapPinned = useChatStore((state) => state.mapPinned);
    const patchThread = useChatStore((state) => state.patchThread);
    const [typingNames, setTypingNames] = useState<string[]>([]);
    const whisperAt = useRef(0);
    const typingExpiry = useRef<Map<number, number>>(new Map());
    const messagesRef = useRef(messages);
    const presenceRef = useRef<{
        whisper: (event: string, data: Record<string, unknown>) => void;
    } | null>(null);

    useEffect(() => {
        messagesRef.current = messages;
    });

    const openThreadKey = `${String(open)}:${scopeKey}`;
    const [typingResetKey, setTypingResetKey] = useState(openThreadKey);

    // Opening the drawer or switching thread forgets who was typing, during render
    // (React's "adjust state on prop change" pattern).
    if (typingResetKey !== openThreadKey) {
        setTypingResetKey(openThreadKey);

        if (open) {
            setTypingNames([]);
        }
    }

    useEffect(() => {
        if (!open || !realtimeOn || !liveChatId) {
            return;
        }

        const echo = ensureEcho(true);

        if (!echo) {
            return;
        }

        const channelName = `chat.${liveChatId}`;
        const channel = echo.join(channelName);
        presenceRef.current = channel;

        channel.listen(
            '.MessageCreated',
            (event: { message?: ItemChatMessage }) => {
                const next = event.message;

                if (!next) {
                    return;
                }

                const id = liveChatIdRef.current;

                if (!id) {
                    return;
                }

                if (next.user?.id === viewerId) {
                    forceScrollBottomRef.current = true;
                    dropEchoedPending(next);
                }

                const before =
                    useChatStore.getState().messagesByChatId[id]?.messages ??
                    [];
                appendMessage(id, next);

                if (!before.some((row) => row.id === next.id)) {
                    onChatCountChangeRef.current(before.length + 1);
                    patchThread(id, {
                        last_message: {
                            id: next.id,
                            body: next.body,
                            user_name: next.user?.name ?? null,
                            created_at: next.created_at,
                            image_attachment_id:
                                next.attachments.find((row) =>
                                    row.mime.startsWith('image/'),
                                )?.id ?? null,
                        },
                        updated_at: next.created_at,
                    });
                }

                if (scope) {
                    void markChatRead(scope).catch(() => {
                        // Ignore; unread will catch up on next open.
                    });
                }
            },
        );
        channel.listen(
            '.MessageUpdated',
            (event: { message?: ItemChatMessage }) => {
                const next = event.message;

                if (!next) {
                    return;
                }

                const id = liveChatIdRef.current;

                if (!id) {
                    return;
                }

                replaceMessage(id, next);
                mapPinned(id, (prev) => {
                    if (next.is_pinned) {
                        const row: ChatPinned = {
                            id: next.id,
                            body: next.body,
                            user: next.user,
                            mentioned_users: next.mentioned_users,
                            mentioned_collections:
                                next.mentioned_collections ?? [],
                        };

                        if (prev.some((item) => item.id === next.id)) {
                            return prev.map((item) =>
                                item.id === next.id ? row : item,
                            );
                        }

                        return [row, ...prev];
                    }

                    return prev.filter((item) => item.id !== next.id);
                });
            },
        );
        channel.listen('.MessageDeleted', (event: { id?: number }) => {
            const id = event.id;

            if (!id) {
                return;
            }

            const chatId = liveChatIdRef.current;

            if (!chatId) {
                return;
            }

            removeCachedMessage(chatId, id);

            if (countedDeletionIdsRef.current.has(id)) {
                return;
            }

            countedDeletionIdsRef.current.add(id);
            onChatCountChangeRef.current(Math.max(0, chatCountRef.current - 1));
        });
        channel.listen(
            '.ReactionToggled',
            (event: {
                message_id?: number;
                user_id?: number;
                user_name?: string;
                emoji?: string;
                added?: boolean;
            }) => {
                const messageId = event.message_id;
                const emoji = event.emoji;
                const userId = event.user_id;

                if (!messageId || !emoji || !userId) {
                    return;
                }

                // This tab's own toggles do not echo back here: the request sends
                // `X-Socket-ID` and the server broadcasts to others only. A toggle by
                // the same user in another tab does arrive, and flips `reacted`.
                const isOwn = userId === viewerId;
                const chatId = liveChatIdRef.current;

                if (!chatId) {
                    return;
                }

                const actor = {
                    id: userId,
                    name: event.user_name?.trim() || `User ${userId}`,
                };

                mapMessages(chatId, (prev) =>
                    prev.map((row) =>
                        row.id === messageId
                            ? {
                                  ...row,
                                  reactions: applyReactionToggle(
                                      row.reactions,
                                      emoji,
                                      event.added === true,
                                      actor,
                                      isOwn,
                                  ),
                              }
                            : row,
                    ),
                );
            },
        );
        channel.listenForWhisper(
            'typing',
            (payload: { userId?: number; name?: string }) => {
                const id = Number(payload.userId);

                if (!id || id === viewerId) {
                    return;
                }

                typingExpiry.current.set(id, Date.now() + TYPING_EXPIRE_MS);
                setTypingNames((prev) => {
                    const name = payload.name || `User ${id}`;

                    return prev.includes(name) ? prev : [...prev, name];
                });
            },
        );

        const tick = window.setInterval(() => {
            const now = Date.now();
            let changed = false;

            typingExpiry.current.forEach((expires, id) => {
                if (expires < now) {
                    typingExpiry.current.delete(id);
                    changed = true;
                }
            });

            if (changed) {
                const names: string[] = [];
                typingExpiry.current.forEach((_, id) => {
                    const existing = messagesRef.current.find(
                        (row) => row.user?.id === id,
                    )?.user?.name;
                    names.push(existing ?? `User ${id}`);
                });
                setTypingNames(names);
            }
        }, 500);

        return () => {
            window.clearInterval(tick);
            presenceRef.current = null;
            echo.leave(channelName);
        };
    }, [
        open,
        realtimeOn,
        liveChatId,
        viewerId,
        scopeKey,
        appendMessage,
        replaceMessage,
        removeCachedMessage,
        mapMessages,
        mapPinned,
        patchThread,
        scope,
        liveChatIdRef,
        chatCountRef,
        countedDeletionIdsRef,
        onChatCountChangeRef,
        forceScrollBottomRef,
        dropEchoedPending,
    ]);

    /** Tell the other viewers this user is typing, at most every 500 ms. */
    const whisperTyping = useCallback((): void => {
        if (!realtimeOn) {
            return;
        }

        const now = Date.now();

        if (now - whisperAt.current < WHISPER_THROTTLE_MS) {
            return;
        }

        whisperAt.current = now;
        presenceRef.current?.whisper('typing', {
            userId: viewerId,
            name: viewerName,
        });
    }, [realtimeOn, viewerId, viewerName]);

    return { typingNames, whisperTyping };
}
