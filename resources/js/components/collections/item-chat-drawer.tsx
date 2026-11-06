import { Link, usePage } from '@inertiajs/react';
import {
    Ellipsis,
    FileText,
    MoreVertical,
    Paperclip,
    Pin,
    Smile,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatMediaAlbum } from '@/components/chat/chat-media-album';
import { ChatMediaLightbox } from '@/components/chat/chat-media-lightbox';
import { ChatMentionHitLabel } from '@/components/chat/chat-mention-hit';
import {
    ChatMentionMenu,
    handleMentionMenuKeyDown,
} from '@/components/chat/chat-mention-menu';
import {
    ChatMessageActionsButton,
    ChatMessageContextMenu,
} from '@/components/chat/chat-message-actions-menu';
import type { ChatMessageActions } from '@/components/chat/chat-message-actions-menu';
import { ChatMessageReactions } from '@/components/chat/chat-message-reactions';
import { ChatMessageScroller } from '@/components/chat/chat-message-scroller';
import type { ChatMessageScrollerHandle } from '@/components/chat/chat-message-scroller';
import { ChatOutgoingAttachPreview } from '@/components/chat/chat-outgoing-attach-preview';
import type { PendingChatMessage } from '@/components/chat/chat-outgoing-attach-preview';
import { ChatSendAttachmentsDialog } from '@/components/chat/chat-send-attachments-dialog';
import type { SendAttachItem } from '@/components/chat/chat-send-attachments-dialog';
import { ChatThreadHeader } from '@/components/chat/chat-thread-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerFooter } from '@/components/ui/drawer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import {
    Message,
    MessageAvatar,
    MessageContent,
    MessageGroup,
    MessageHeader,
} from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { NativeSelect } from '@/components/ui/native-select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { avatarToneClass } from '@/lib/avatar-tone';
import type { ChatThreadIdentity } from '@/lib/chat-thread-identity';
import { chatMentionsEnabled } from '@/lib/chat-thread-identity';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import { formatDateTime, initialsFromName } from '@/lib/format';
import {
    addChatAttachmentToField,
    chatAttachmentPreviewUrl,
    chatAttachmentUrl,
    deleteChatAttachment,
    deleteMessage,
    fetchMentions,
    fetchMessages,
    markChatRead,
    stopChatViewing,
    patchMessage,
    pinMessage,
    postMessage,
    putChatNotify,
    saveChatAttachmentToFiles,
    toggleReaction,
    uploadChatAttachment,
} from '@/lib/item-chat-api';
import type {
    ChatAttachment,
    ChatCollection,
    ChatPinned,
    ChatScope,
    ChatUser,
    ItemChatMessage,
} from '@/lib/item-chat-api';
import {
    collectionMentionLabel,
    composeBodyForSubmit,
    mentionDisplayLabel,
    mentionQueryAt,
    storedBodyToDraft,
} from '@/lib/item-chat-mentions';
import { applyReactionToggle } from '@/lib/item-chat-reactions';
import { pendingMatchesEchoMessage } from '@/lib/pending-chat-match';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat/store';
import { mergeLatestPage } from '@/stores/chat/types';
import type { CollectionFieldRow } from '@/types/collections';

const EMOJI_GRID = [
    '😀',
    '😃',
    '😄',
    '😁',
    '😅',
    '😂',
    '😊',
    '🙂',
    '😉',
    '😍',
    '😘',
    '😜',
    '🤔',
    '😎',
    '😢',
    '😭',
    '😡',
    '👍',
    '👎',
    '👏',
    '🙏',
    '🔥',
    '✨',
    '🎉',
    '❤️',
    '💯',
    '✅',
    '❌',
    '📌',
    '📎',
    '💡',
    '👀',
    '🙌',
    '💪',
    '🤝',
    '⭐',
    '🚀',
    '💬',
];

const FILE_FIELD_TYPES = new Set(['image', 'files']);
const TYPING_EXPIRE_MS = 2500;
const WHISPER_THROTTLE_MS = 500;
type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    collectionId?: number;
    itemId?: number;
    chatId?: string | null;
    kind?: 'item' | 'direct';
    variant?: 'drawer' | 'pane';
    fields: CollectionFieldRow[];
    chatCount: number;
    onChatCountChange: (count: number) => void;
    thread?: ChatThreadIdentity | null;
    canCreateDirect?: boolean;
};

function renderMessageBody(
    body: string,
    mentions: ChatUser[],
    collections: ChatCollection[] = [],
): ReactNode {
    const names = new Map(mentions.map((user) => [user.id, user.name]));
    const collectionNames = new Map(
        collections.map((collection) => [collection.id, collection.name]),
    );
    const nodes: ReactNode[] = [];
    let last = 0;
    const re = /@\[(user|collection):(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(body)) !== null) {
        if (match.index > last) {
            nodes.push(body.slice(last, match.index));
        }

        const kind = match[1];
        const id = Number(match[2]);

        if (kind === 'collection') {
            nodes.push(
                <Link
                    key={`${match.index}-c-${id}`}
                    href={`/collections/${id}`}
                    className="rounded bg-primary/15 px-1 font-medium underline-offset-2 hover:underline"
                >
                    @{collectionNames.get(id) ?? `collection ${id}`}
                </Link>,
            );
        } else {
            nodes.push(
                <span
                    key={`${match.index}-${id}`}
                    className="rounded bg-primary/15 px-1 font-medium"
                >
                    @{names.get(id) ?? `user ${id}`}
                </span>,
            );
        }

        last = match.index + match[0].length;
    }

    if (last < body.length) {
        nodes.push(body.slice(last));
    }

    return nodes.length > 0 ? nodes : body;
}

function dayLabel(iso: string | null): string {
    if (!iso) {
        return '';
    }

    return formatDateTime(iso, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function commentTime(iso: string | null): string {
    if (!iso) {
        return '';
    }

    return formatDateTime(iso, {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Chat drawer for a collection item.
 */
export function ItemChatDrawer({
    open,
    onOpenChange,
    collectionId,
    itemId,
    chatId = null,
    kind = 'item',
    variant = 'drawer',
    fields,
    chatCount,
    onChatCountChange,
    thread = null,
    canCreateDirect = false,
}: Props) {
    const { t } = useTranslation();
    const page = usePage();
    const { can } = useCan();
    const viewerId = page.props.auth.user?.id ?? 0;
    const viewerName =
        [page.props.auth.user?.first_name, page.props.auth.user?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() ||
        page.props.auth.user?.email ||
        '';
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
    const chatMaxUploadBytes =
        page.props.projectSettings?.chatMaxUploadBytes ?? null;
    const canCreateFiles = can(PermissionEnum.CanCreateFiles);
    const fileFields = fields.filter((field) =>
        FILE_FIELD_TYPES.has(field.type),
    );

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

    const mentionsEnabled = useMemo(
        () =>
            kind === 'item'
                ? true
                : thread
                  ? chatMentionsEnabled(kind, thread.participants, viewerId)
                  : false,
        [kind, thread, viewerId],
    );

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
    const appendMessage = useChatStore((state) => state.appendMessage);
    const replaceMessage = useChatStore((state) => state.replaceMessage);
    const removeCachedMessage = useChatStore((state) => state.removeMessage);
    const mapMessages = useChatStore((state) => state.mapMessages);
    const mapPinned = useChatStore((state) => state.mapPinned);
    const touchMessages = useChatStore((state) => state.touchMessages);
    const patchThread = useChatStore((state) => state.patchThread);

    const [notify, setNotify] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [attachDialogOpen, setAttachDialogOpen] = useState(false);
    const [attachItems, setAttachItems] = useState<SendAttachItem[]>([]);
    const [attachCaption, setAttachCaption] = useState('');
    const [composerDragOver, setComposerDragOver] = useState(false);
    const [mentionedUsers, setMentionedUsers] = useState<ChatUser[]>([]);
    const [mentionedCollections, setMentionedCollections] = useState<
        ChatCollection[]
    >([]);
    const [pendingMessages, setPendingMessages] = useState<
        PendingChatMessage[]
    >([]);
    const pendingMessagesRef = useRef(pendingMessages);
    const pendingAbortRef = useRef<Map<string, AbortController>>(new Map());
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionHits, setMentionHits] = useState<
        Array<
            | { type: 'user'; id: number; name: string; email?: string }
            | { type: 'collection'; id: number; name: string }
        >
    >([]);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [typingNames, setTypingNames] = useState<string[]>([]);
    const [addFieldFor, setAddFieldFor] = useState<ChatAttachment | null>(null);
    const [addFieldName, setAddFieldName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingDraft, setEditingDraft] = useState('');
    const [replyTo, setReplyTo] = useState<ItemChatMessage | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const scrollerRef = useRef<ChatMessageScrollerHandle | null>(null);
    // Own sends and own echoes jump to the latest message, even when scrolled up.
    const forceScrollBottomRef = useRef(false);
    // Oldest loaded message before "Load older", to keep it in view after the prepend.
    const olderAnchorIdRef = useRef<number | null>(null);
    const uploadGen = useRef(0);
    const pageLoadGen = useRef(0);
    const olderLoadGen = useRef(0);
    const whisperAt = useRef(0);
    const typingExpiry = useRef<Map<number, number>>(new Map());
    const messagesRef = useRef(messages);
    const liveChatIdRef = useRef(liveChatId);
    const chatCountRef = useRef(chatCount);
    const onChatCountChangeRef = useRef(onChatCountChange);
    const presenceRef = useRef<{
        whisper: (event: string, data: Record<string, unknown>) => void;
    } | null>(null);

    useEffect(() => {
        messagesRef.current = messages;
    });

    useEffect(() => {
        pendingMessagesRef.current = pendingMessages;
    }, [pendingMessages]);

    liveChatIdRef.current = liveChatId;
    chatCountRef.current = chatCount;
    onChatCountChangeRef.current = onChatCountChange;

    const scopeKey =
        scope?.mode === 'hub'
            ? `hub:${scope.chatId}`
            : scope
              ? `item:${scope.collectionId}:${scope.itemId}`
              : null;

    useEffect(() => {
        if (forceScrollBottomRef.current) {
            forceScrollBottomRef.current = false;
            scrollerRef.current?.scrollToEnd({ behavior: 'smooth' });
        }
    }, [messages, pendingMessages]);

    useEffect(() => {
        const olderAnchorId = olderAnchorIdRef.current;

        // Wait until load-more finishes so the prepend is in the DOM.
        if (olderAnchorId === null || loadingMore) {
            return;
        }

        olderAnchorIdRef.current = null;
        scrollerRef.current?.scrollToMessage(String(olderAnchorId), {
            align: 'start',
        });
    }, [loadingMore, messages]);

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
        [scope, t, prependOlderMessages, setMessagesCache],
    );

    useEffect(() => {
        setLiveChatId(chatId);
    }, [chatId]);

    useEffect(() => {
        if (!replyTo) {
            return;
        }

        const handle = window.setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);

        return () => window.clearTimeout(handle);
    }, [replyTo]);

    useEffect(() => {
        if (!open) {
            clearAttachBatch();
            setPendingMessages([]);
            setComposerDragOver(false);

            return;
        }

        setDraft('');
        clearAttachBatch();
        setMentionedUsers([]);
        setEditingId(null);
        setReplyTo(null);
        setTypingNames([]);

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
        // scopeKey covers scope identity; load is intentionally omitted.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when thread changes
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

    useEffect(() => {
        setMentionHighlight(0);
    }, [mentionHits]);

    useEffect(() => {
        if (mentionsEnabled) {
            return;
        }

        setMentionOpen(false);
        setMentionStart(null);
        setMentionHits([]);
        setMentionedUsers([]);
        setMentionedCollections([]);
    }, [mentionsEnabled]);

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
                    // Drop only one matching pending — wiping all non-failed
                    // pending aborted in-flight uploads/sends (never POSTed).
                    setPendingMessages((prev) => {
                        const idx = prev.findIndex((row) =>
                            pendingMatchesEchoMessage(row, next),
                        );

                        if (idx < 0) {
                            return prev;
                        }

                        const gone = prev[idx]!;

                        for (const file of gone.files) {
                            if (file.previewUrl) {
                                URL.revokeObjectURL(file.previewUrl);
                            }
                        }

                        const nextPending = prev.filter((_, i) => i !== idx);
                        pendingMessagesRef.current = nextPending;

                        return nextPending;
                    });
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

                const isOwn = userId === viewerId;

                if (isOwn) {
                    return;
                }

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
                                      false,
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
    ]);

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

    const composerTarget = (): {
        el: HTMLTextAreaElement | null;
        value: string;
        setValue: (next: string) => void;
    } => {
        if (attachDialogOpen) {
            return {
                el: captionTextareaRef.current,
                value: attachCaption,
                setValue: setAttachCaption,
            };
        }

        return {
            el: textareaRef.current,
            value: draft,
            setValue: setDraft,
        };
    };

    const insertAtCaret = (text: string, extraMention?: number): void => {
        const { el, value, setValue } = composerTarget();
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + text + value.slice(end);
        setValue(next);

        if (extraMention !== undefined) {
            setMentionedUsers((prev) =>
                prev.some((row) => row.id === extraMention)
                    ? prev
                    : [
                          ...prev,
                          {
                              id: extraMention,
                              name: `User ${extraMention}`,
                          },
                      ],
            );
        }

        window.setTimeout(() => {
            el?.focus();
            const pos = start + text.length;
            el?.setSelectionRange(pos, pos);
        }, 0);
    };

    const onComposerChange = (value: string, caret: number): void => {
        if (attachDialogOpen) {
            setAttachCaption(value);
        } else {
            setDraft(value);
            whisperTyping();
        }

        if (!mentionsEnabled) {
            setMentionOpen(false);
            setMentionStart(null);

            return;
        }

        const query = mentionQueryAt(value, caret);

        if (!query) {
            setMentionOpen(false);
            setMentionStart(null);

            return;
        }

        setMentionStart(query.start);
        setMentionOpen(true);

        if (!scope) {
            return;
        }

        void fetchMentions(scope, query.q)
            .then((payload) => {
                const hits: Array<
                    | { type: 'user'; id: number; name: string; email?: string }
                    | { type: 'collection'; id: number; name: string }
                > = [
                    ...payload.users.map((user) => ({
                        type: 'user' as const,
                        id: user.id,
                        name: user.name,
                        email: user.email,
                    })),
                    ...payload.collections.map((collection) => ({
                        type: 'collection' as const,
                        id: collection.id,
                        name: collection.name,
                    })),
                ];
                setMentionHits(hits);
            })
            .catch(() => setMentionHits([]));
    };

    const pickMention = (
        hit:
            | { type: 'user'; id: number; name: string; email?: string }
            | { type: 'collection'; id: number; name: string },
    ): void => {
        if (!mentionsEnabled) {
            return;
        }

        const { el, value, setValue } = composerTarget();
        const caret = el?.selectionStart ?? value.length;
        const start =
            mentionStart ?? mentionQueryAt(value, caret)?.start ?? caret;
        const label =
            hit.type === 'collection'
                ? `${collectionMentionLabel(hit)} `
                : `${mentionDisplayLabel(hit)} `;
        const next = value.slice(0, start) + label + value.slice(caret);
        setValue(next);

        if (hit.type === 'user') {
            setMentionedUsers((prev) =>
                prev.some((row) => row.id === hit.id) ? prev : [...prev, hit],
            );
        } else {
            setMentionedCollections((prev) =>
                prev.some((row) => row.id === hit.id) ? prev : [...prev, hit],
            );
        }

        setMentionOpen(false);
        setMentionStart(null);
        window.setTimeout(() => {
            el?.focus();
            const pos = start + label.length;
            el?.setSelectionRange(pos, pos);
        }, 0);
    };

    const mentionMenu = {
        isOpen: mentionsEnabled && mentionOpen && !attachDialogOpen,
        hits: mentionHits,
        highlightIndex: mentionHighlight,
        onHighlightChange: setMentionHighlight,
        onPick: pickMention,
        onDismiss: (): void => {
            setMentionOpen(false);
            setMentionStart(null);
        },
    };

    const insertMentionTrigger = (): void => {
        if (!mentionsEnabled) {
            return;
        }

        const { el, value } = composerTarget();
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + '@' + value.slice(end);
        onComposerChange(next, start + 1);
        window.setTimeout(() => {
            el?.focus();
            el?.setSelectionRange(start + 1, start + 1);
        }, 0);
    };

    const revokeAttachPreviews = (items: SendAttachItem[]): void => {
        for (const item of items) {
            if (item.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
        }
    };

    const clearAttachBatch = useCallback((): void => {
        // Invalidate in-flight uploads so late callbacks cannot repopulate items.
        uploadGen.current += 1;
        setAttachItems((prev) => {
            revokeAttachPreviews(prev);

            return [];
        });
        setAttachCaption('');
        setAttachDialogOpen(false);
        setMentionOpen(false);
        setMentionStart(null);
        setEmojiOpen(false);
    }, []);

    const patchPending = useCallback(
        (
            clientId: string,
            updater: (row: PendingChatMessage) => PendingChatMessage,
        ): void => {
            setPendingMessages((prev) => {
                const next = prev.map((row) =>
                    row.clientId === clientId ? updater(row) : row,
                );
                pendingMessagesRef.current = next;

                return next;
            });
        },
        [],
    );

    const finishPendingSuccess = useCallback(
        (clientId: string, message: ItemChatMessage): void => {
            const id = liveChatIdRef.current;
            forceScrollBottomRef.current = true;
            setPendingMessages((prev) => {
                const gone = prev.find((row) => row.clientId === clientId);

                if (gone) {
                    for (const file of gone.files) {
                        if (file.previewUrl) {
                            URL.revokeObjectURL(file.previewUrl);
                        }
                    }
                }

                const next = prev.filter((row) => row.clientId !== clientId);
                pendingMessagesRef.current = next;

                return next;
            });
            pendingAbortRef.current.delete(clientId);

            if (id) {
                appendMessage(id, message);
                patchThread(id, {
                    last_message: {
                        id: message.id,
                        body: message.body,
                        user_name: message.user?.name ?? null,
                        created_at: message.created_at,
                        image_attachment_id:
                            message.attachments.find((row) =>
                                row.mime.startsWith('image/'),
                            )?.id ?? null,
                    },
                    updated_at: message.created_at,
                    unread_count: 0,
                });
            }

            onChatCountChangeRef.current(chatCountRef.current + 1);

            if (!liveChatIdRef.current || !realtimeOn) {
                load();
            }
        },
        [appendMessage, load, patchThread, realtimeOn],
    );

    const runPendingPipeline = useCallback(
        async (clientId: string): Promise<void> => {
            if (!scope) {
                return;
            }

            const current = pendingMessagesRef.current.find(
                (row) => row.clientId === clientId,
            );

            if (!current) {
                return;
            }

            // Local snapshot survives Echo/UI clearing the pending row mid-flight.
            // Previous bug: afterUpload missing → silent return → never POST.
            let snapshot: PendingChatMessage = current;

            const abort = new AbortController();
            pendingAbortRef.current.set(clientId, abort);

            const applySnapshot = (
                updater: (row: PendingChatMessage) => PendingChatMessage,
            ): void => {
                snapshot = updater(snapshot);
                patchPending(clientId, () => snapshot);
            };

            try {
                const hasFiles = snapshot.files.length > 0;
                applySnapshot((row) => ({
                    ...row,
                    status: hasFiles ? 'uploading' : 'sending',
                    error: null,
                    files: row.files.map((file) => ({
                        ...file,
                        error: null,
                    })),
                }));

                const attachmentIds: string[] = [];

                for (const file of [...snapshot.files]) {
                    if (abort.signal.aborted) {
                        throw new DOMException('Upload aborted', 'AbortError');
                    }

                    const live =
                        snapshot.files.find(
                            (entry) => entry.key === file.key,
                        ) ?? file;

                    if (live.uploadedId) {
                        attachmentIds.push(live.uploadedId);
                        applySnapshot((row) => ({
                            ...row,
                            files: row.files.map((entry) =>
                                entry.key === file.key
                                    ? { ...entry, progress: 100 }
                                    : entry,
                            ),
                        }));
                        continue;
                    }

                    const uploaded = await uploadChatAttachment(
                        scope,
                        live.file,
                        {
                            maxBytes: chatMaxUploadBytes,
                            signal: abort.signal,
                            onProgress: (progress) => {
                                applySnapshot((row) => ({
                                    ...row,
                                    files: row.files.map((entry) =>
                                        entry.key === file.key
                                            ? { ...entry, progress }
                                            : entry,
                                    ),
                                }));
                            },
                        },
                    );

                    attachmentIds.push(uploaded.id);
                    applySnapshot((row) => ({
                        ...row,
                        files: row.files.map((entry) =>
                            entry.key === file.key
                                ? {
                                      ...entry,
                                      uploadedId: uploaded.id,
                                      progress: 100,
                                      error: null,
                                  }
                                : entry,
                        ),
                    }));
                }

                if (abort.signal.aborted) {
                    throw new DOMException('Upload aborted', 'AbortError');
                }

                applySnapshot((row) => ({
                    ...row,
                    status: 'sending',
                }));

                const message = await postMessage(scope, {
                    body: snapshot.body,
                    mentioned_user_ids: snapshot.mentionedIds,
                    attachment_ids: attachmentIds,
                    reply_to_id: snapshot.replyTo?.id ?? null,
                });

                finishPendingSuccess(clientId, message);
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    return;
                }

                const message =
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.sendError');

                applySnapshot((row) => ({
                    ...row,
                    status: 'failed',
                    error: message,
                }));

                // Re-surface failed pending if Echo cleared the row mid-flight.
                setPendingMessages((prev) => {
                    if (prev.some((row) => row.clientId === clientId)) {
                        return prev;
                    }

                    const next = [...prev, snapshot];
                    pendingMessagesRef.current = next;

                    return next;
                });
            }
        },
        [chatMaxUploadBytes, finishPendingSuccess, patchPending, scope, t],
    );

    const send = (): void => {
        const trimmed = draft.trim();
        const { body, mentionedIds } = composeBodyForSubmit(
            trimmed,
            mentionedUsers,
            mentionedCollections,
        );

        if (body === '' || attachDialogOpen) {
            return;
        }

        if (!scope) {
            return;
        }

        const clientId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pending: PendingChatMessage = {
            clientId,
            status: 'sending',
            body,
            mentionedUsers,
            mentionedCollections,
            mentionedIds,
            replyTo: replyTo
                ? {
                      id: replyTo.id,
                      body: replyTo.body,
                      user: replyTo.user,
                  }
                : null,
            files: [],
            error: null,
        };

        setError(null);
        setDraft('');
        setMentionedUsers([]);
        setMentionedCollections([]);
        setReplyTo(null);
        forceScrollBottomRef.current = true;
        // Ref first so pipeline never races setState.
        pendingMessagesRef.current = [...pendingMessagesRef.current, pending];
        setPendingMessages(pendingMessagesRef.current);
        void runPendingPipeline(clientId);
    };

    const sendAttachBatch = (): void => {
        if (!scope) {
            return;
        }

        if (attachItems.length === 0) {
            return;
        }

        const trimmed = attachCaption.trim();
        const { body, mentionedIds } = composeBodyForSubmit(
            trimmed,
            mentionedUsers,
            mentionedCollections,
        );

        const clientId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pending: PendingChatMessage = {
            clientId,
            status: 'uploading',
            body,
            mentionedUsers,
            mentionedCollections,
            mentionedIds,
            replyTo: replyTo
                ? {
                      id: replyTo.id,
                      body: replyTo.body,
                      user: replyTo.user,
                  }
                : null,
            files: attachItems.map((item) => ({
                key: item.key,
                file: item.file,
                previewUrl: item.previewUrl,
                progress: item.uploaded ? 100 : 0,
                uploadedId: item.uploaded?.id ?? null,
                error: item.error,
            })),
            error: null,
        };

        setError(null);
        setAttachDialogOpen(false);
        setAttachItems([]);
        setAttachCaption('');
        setDraft('');
        setMentionedUsers([]);
        setMentionedCollections([]);
        setReplyTo(null);
        setMentionOpen(false);
        setMentionStart(null);
        setEmojiOpen(false);
        forceScrollBottomRef.current = true;
        pendingMessagesRef.current = [...pendingMessagesRef.current, pending];
        setPendingMessages(pendingMessagesRef.current);
        void runPendingPipeline(clientId);
    };

    const retryPending = (clientId: string): void => {
        void runPendingPipeline(clientId);
    };

    const removePendingFile = (clientId: string, fileKey: string): void => {
        if (!scope) {
            return;
        }

        setPendingMessages((prev) => {
            const next: PendingChatMessage[] = [];

            for (const row of prev) {
                if (row.clientId !== clientId) {
                    next.push(row);
                    continue;
                }

                const target = row.files.find((file) => file.key === fileKey);

                if (target?.uploadedId) {
                    void deleteChatAttachment(scope, target.uploadedId).catch(
                        () => {
                            /* orphan TTL cleanup */
                        },
                    );
                }

                if (target?.previewUrl) {
                    URL.revokeObjectURL(target.previewUrl);
                }

                const files = row.files.filter((file) => file.key !== fileKey);

                if (files.length === 0 && row.body.trim() === '') {
                    pendingAbortRef.current.get(clientId)?.abort();
                    pendingAbortRef.current.delete(clientId);
                    continue;
                }

                next.push({ ...row, files });
            }

            pendingMessagesRef.current = next;

            return next;
        });
    };

    const removeAttachItem = (key: string): void => {
        setAttachItems((prev) => {
            const next = prev.filter((item) => {
                if (item.key !== key) {
                    return true;
                }

                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }

                return false;
            });

            if (next.length === 0) {
                setAttachDialogOpen(false);
                setAttachCaption('');
            }

            return next;
        });
    };

    const closeAttachDialog = (): void => {
        setDraft((prev) => (prev.trim() !== '' ? prev : attachCaption));
        clearAttachBatch();
    };

    const saveEdit = (comment: ItemChatMessage): void => {
        const { body, mentionedIds } = composeBodyForSubmit(
            editingDraft,
            comment.mentioned_users,
        );

        void patchMessage(scope!, comment.id, {
            body,
            mentioned_user_ids: mentionedIds,
        })
            .then((next) => {
                const id = liveChatIdRef.current;

                if (id) {
                    replaceMessage(id, next);
                }

                setEditingId(null);
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.sendError'),
                );
            });
    };

    const removeMessage = (comment: ItemChatMessage): void => {
        if (!scope) {
            return;
        }

        void deleteMessage(scope, comment.id)
            .then(() => {
                const id = liveChatIdRef.current;

                if (id) {
                    removeCachedMessage(id, comment.id);
                }

                onChatCountChangeRef.current(Math.max(0, chatCount - 1));
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.error'),
                );
            });
    };

    const scrollToMessage = (id: number): void => {
        scrollerRef.current?.scrollToMessage(String(id), {
            align: 'center',
            behavior: 'smooth',
        });
    };

    /** Reply, copy, pin, react, edit and delete for one message's menus. */
    const messageActionsFor = (
        comment: ItemChatMessage,
    ): ChatMessageActions => ({
        canEdit: comment.can_edit,
        canDelete: comment.can_delete,
        isPinned: comment.is_pinned,
        onReply: () => {
            setReplyTo(comment);
            // After the menu's close autofocus; run next tick.
            window.setTimeout(() => {
                textareaRef.current?.focus();
            }, 0);
        },
        onCopy: () => copyMessageText(comment),
        onPin: () => onPin(comment),
        onReact: (emoji) => onReact(comment, emoji),
        onEdit: () => {
            setEditingId(comment.id);
            setEditingDraft(
                storedBodyToDraft(comment.body, comment.mentioned_users),
            );
        },
        onDelete: () => removeMessage(comment),
    });

    const copyMessageText = (message: ItemChatMessage): void => {
        const text = storedBodyToDraft(message.body, message.mentioned_users);
        void navigator.clipboard.writeText(text);
    };

    const onReact = (message: ItemChatMessage, emoji: string): void => {
        if (!scope) {
            return;
        }

        const existing = message.reactions.find((row) => row.emoji === emoji);
        const added = !(existing?.reacted ?? false);
        const id = liveChatIdRef.current;
        const actor = { id: viewerId, name: viewerName || `User ${viewerId}` };

        if (id) {
            mapMessages(id, (prev) =>
                prev.map((row) =>
                    row.id === message.id
                        ? {
                              ...row,
                              reactions: applyReactionToggle(
                                  row.reactions,
                                  emoji,
                                  added,
                                  actor,
                                  true,
                              ),
                          }
                        : row,
                ),
            );
        }

        void toggleReaction(scope, message.id, emoji)
            .then((payload) => {
                const chatId = liveChatIdRef.current;

                if (!chatId) {
                    return;
                }

                mapMessages(chatId, (prev) =>
                    prev.map((row) =>
                        row.id === message.id
                            ? { ...row, reactions: payload.reactions }
                            : row,
                    ),
                );
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.error'),
                );
                load();
            });
    };

    const onPin = (message: ItemChatMessage): void => {
        if (!scope) {
            return;
        }

        const nextPinned = !message.is_pinned;
        void pinMessage(scope, message.id, nextPinned)
            .then((updated) => {
                const id = liveChatIdRef.current;

                if (!id) {
                    return;
                }

                replaceMessage(id, updated);
                mapPinned(id, (prev) => {
                    if (updated.is_pinned) {
                        const row: ChatPinned = {
                            id: updated.id,
                            body: updated.body,
                            user: updated.user,
                            mentioned_users: updated.mentioned_users,
                            mentioned_collections:
                                updated.mentioned_collections ?? [],
                        };

                        if (prev.some((item) => item.id === updated.id)) {
                            return prev.map((item) =>
                                item.id === updated.id ? row : item,
                            );
                        }

                        return [row, ...prev];
                    }

                    return prev.filter((item) => item.id !== updated.id);
                });
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.error'),
                );
            });
    };

    const onPickFiles = (fileList: FileList | File[] | null): void => {
        if (!fileList || !scope) {
            return;
        }

        const files = Array.from(fileList);

        if (files.length === 0) {
            return;
        }

        const gen = ++uploadGen.current;
        const staged: SendAttachItem[] = files.map((file, index) => ({
            key: `${Date.now()}-${index}-${file.name}-${file.size}`,
            file,
            previewUrl:
                file.type.startsWith('image/') || file.type.startsWith('video/')
                    ? URL.createObjectURL(file)
                    : null,
            uploaded: null,
            error: null,
        }));

        setAttachItems((prev) => {
            if (attachDialogOpen) {
                return [...prev, ...staged];
            }

            revokeAttachPreviews(prev);

            return staged;
        });

        if (!attachDialogOpen) {
            setAttachCaption(draft);
            setDraft('');
            setAttachDialogOpen(true);
        }

        for (const item of staged) {
            void uploadChatAttachment(scope, item.file, {
                maxBytes: chatMaxUploadBytes,
            })
                .then((uploaded) => {
                    if (gen !== uploadGen.current) {
                        return;
                    }

                    setAttachItems((prev) =>
                        prev.map((row) =>
                            row.key === item.key
                                ? { ...row, uploaded, error: null }
                                : row,
                        ),
                    );
                })
                .catch((err: unknown) => {
                    if (gen !== uploadGen.current) {
                        return;
                    }

                    setAttachItems((prev) =>
                        prev.map((row) =>
                            row.key === item.key
                                ? {
                                      ...row,
                                      error:
                                          err instanceof Error
                                              ? err.message
                                              : t(
                                                    'collections.itemChat.sendError',
                                                ),
                                  }
                                : row,
                        ),
                    );
                });
        }
    };

    const clearComposerDrag = (): void => {
        setComposerDragOver(false);
    };

    const onComposerDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        if (!isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        setComposerDragOver(true);
    };

    const onComposerDragOver = (event: DragEvent<HTMLDivElement>): void => {
        if (!isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setComposerDragOver(true);
    };

    const onComposerDragLeave = (event: DragEvent<HTMLDivElement>): void => {
        const relatedTarget = event.relatedTarget;

        if (
            relatedTarget instanceof Node &&
            event.currentTarget.contains(relatedTarget)
        ) {
            return;
        }

        clearComposerDrag();
    };

    const onComposerDrop = (event: DragEvent<HTMLDivElement>): void => {
        if (!isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearComposerDrag();
        onPickFiles(event.dataTransfer.files);
    };

    /**
     * Consecutive messages from one sender on one day form a group: the name
     * and avatar show once, on the first message.
     */
    const messageGroups = useMemo(() => {
        const groups: Array<{
            key: number;
            items: Array<{
                comment: ItemChatMessage;
                index: number;
                isGroupStart: boolean;
            }>;
        }> = [];

        messages.forEach((comment, index) => {
            const previous = messages[index - 1];
            const isGroupStart =
                !previous ||
                previous.user?.id !== comment.user?.id ||
                dayLabel(previous.created_at) !== dayLabel(comment.created_at);

            if (isGroupStart) {
                groups.push({ key: comment.id, items: [] });
            }

            groups[groups.length - 1]!.items.push({
                comment,
                index,
                isGroupStart,
            });
        });

        return groups;
    }, [messages]);

    const typingLabel = useMemo(() => {
        if (typingNames.length === 0) {
            return null;
        }

        if (typingNames.length === 1) {
            return t('collections.itemChat.typing.one', {
                name: typingNames[0],
            });
        }

        return t('collections.itemChat.typing.many', {
            name: typingNames[0],
            count: typingNames.length - 1,
        });
    }, [t, typingNames]);

    const threadShell = (
        <>
            <ChatThreadHeader
                thread={thread}
                kind={kind}
                viewerId={viewerId}
                variant={variant}
                liveChatId={liveChatId}
                notify={notify}
                onNotifyChange={(next) => {
                    setNotify(next);

                    if (scope) {
                        void putChatNotify(scope, next).catch(() =>
                            setNotify(!next),
                        );
                    }
                }}
                canCreateDirect={canCreateDirect}
            />
            <div
                className="relative flex min-h-0 flex-1 flex-col"
                data-test="chat-file-dropzone"
                onDragEnter={onComposerDragEnter}
                onDragOver={onComposerDragOver}
                onDragLeave={onComposerDragLeave}
                onDrop={onComposerDrop}
            >
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <ChatMessageScroller
                        key={scopeKey ?? 'none'}
                        scrollerRef={scrollerRef}
                        empty={
                            !loading && messages.length === 0 ? (
                                <p className="m-auto text-sm text-muted-foreground">
                                    {t('collections.itemChat.empty')}
                                </p>
                            ) : null
                        }
                        contentClassName="gap-3 px-6 pt-6 pb-8"
                        overlay={
                            loading || typingLabel ? (
                                <div className="flex flex-col items-center gap-1">
                                    {loading ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Spinner className="size-4" />
                                            {t('collections.itemChat.loading')}
                                        </div>
                                    ) : null}
                                    {typingLabel ? (
                                        <Marker
                                            role="status"
                                            className="w-auto rounded-full bg-background/90 px-2 py-0.5 text-xs shadow-sm"
                                        >
                                            <MarkerIcon>
                                                <Ellipsis className="animate-pulse" />
                                            </MarkerIcon>
                                            <MarkerContent>
                                                {typingLabel}
                                            </MarkerContent>
                                        </Marker>
                                    ) : null}
                                </div>
                            ) : null
                        }
                    >
                        {hasMore ? (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={loading || loadingMore}
                                onClick={() => {
                                    const oldestId = messages[0]?.id;

                                    if (!oldestId || loadingMore) {
                                        return;
                                    }

                                    olderAnchorIdRef.current = oldestId;
                                    load(oldestId);
                                }}
                            >
                                {loadingMore
                                    ? t('collections.itemChat.loading')
                                    : t('collections.itemChat.loadOlder')}
                            </Button>
                        ) : null}
                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : null}
                        {pinned.length > 0 ? (
                            <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2">
                                {pinned.map((row) => {
                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            className="flex items-center gap-2 text-left text-xs"
                                            onClick={() =>
                                                scrollToMessage(row.id)
                                            }
                                        >
                                            <Pin className="size-3 shrink-0 text-muted-foreground" />
                                            <span className="min-w-0 truncate">
                                                <span className="font-medium text-foreground">
                                                    {row.user?.name ?? ''}
                                                </span>
                                                {row.body !== '' ? (
                                                    <>
                                                        {': '}
                                                        {renderMessageBody(
                                                            row.body,
                                                            row.mentioned_users ??
                                                                [],
                                                            row.mentioned_collections ??
                                                                [],
                                                        )}
                                                    </>
                                                ) : null}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                        {messageGroups.map((group) => (
                            <MessageGroup
                                key={group.key}
                                data-test="chat-message-group"
                                className="gap-1"
                            >
                                {group.items.map(
                                    ({ comment, index, isGroupStart }) => {
                                        const userId = comment.user?.id ?? 0;
                                        const mine =
                                            comment.user?.id === viewerId;
                                        const prevDay = dayLabel(
                                            messages[index - 1]?.created_at ??
                                                null,
                                        );
                                        const thisDay = dayLabel(
                                            comment.created_at,
                                        );
                                        const showDay =
                                            thisDay !== '' &&
                                            thisDay !== prevDay;

                                        return (
                                            <MessageScrollerItem
                                                key={comment.id}
                                                messageId={String(comment.id)}
                                            >
                                                {showDay ? (
                                                    <Marker
                                                        variant="separator"
                                                        role="separator"
                                                        aria-label={thisDay}
                                                        className="mb-2 text-xs"
                                                    >
                                                        <MarkerContent>
                                                            {thisDay}
                                                        </MarkerContent>
                                                    </Marker>
                                                ) : null}
                                                <div className="flex items-start gap-2">
                                                    <Message
                                                        align={
                                                            mine
                                                                ? 'end'
                                                                : 'start'
                                                        }
                                                    >
                                                        {!mine ? (
                                                            isGroupStart ? (
                                                                <MessageAvatar className="self-start bg-transparent">
                                                                    <Avatar>
                                                                        {comment
                                                                            .user
                                                                            ?.avatar ? (
                                                                            <AvatarImage
                                                                                src={
                                                                                    comment
                                                                                        .user
                                                                                        .avatar
                                                                                }
                                                                                alt=""
                                                                            />
                                                                        ) : null}
                                                                        <AvatarFallback
                                                                            className={cn(
                                                                                avatarToneClass(
                                                                                    userId,
                                                                                ),
                                                                                'text-xs font-medium',
                                                                            )}
                                                                        >
                                                                            {initialsFromName(
                                                                                comment
                                                                                    .user
                                                                                    ?.name ??
                                                                                    '?',
                                                                            )}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                </MessageAvatar>
                                                            ) : (
                                                                // Keeps grouped bubbles aligned under the first one.
                                                                <div
                                                                    className="w-8 shrink-0"
                                                                    aria-hidden
                                                                />
                                                            )
                                                        ) : null}
                                                        <MessageContent>
                                                            {!mine &&
                                                            isGroupStart ? (
                                                                <MessageHeader className="font-medium text-foreground">
                                                                    {
                                                                        comment
                                                                            .user
                                                                            ?.name
                                                                    }
                                                                </MessageHeader>
                                                            ) : null}
                                                            <div className="flex min-w-0 items-end gap-1 group-data-[align=end]/message:flex-row-reverse">
                                                                <ChatMessageContextMenu
                                                                    actions={messageActionsFor(
                                                                        comment,
                                                                    )}
                                                                >
                                                                    <Bubble
                                                                        variant="muted"
                                                                        align={
                                                                            mine
                                                                                ? 'end'
                                                                                : 'start'
                                                                        }
                                                                        className={cn(
                                                                            comment.attachments.some(
                                                                                isChatMediaAttachment,
                                                                            ) &&
                                                                                'min-w-[16rem]',
                                                                            // BubbleReactions overhang the bubble's bottom edge.
                                                                            comment
                                                                                .reactions
                                                                                .length >
                                                                                0 &&
                                                                                'mb-4',
                                                                        )}
                                                                    >
                                                                        <BubbleContent
                                                                            className={cn(
                                                                                'flex w-full flex-col gap-1',
                                                                                mine &&
                                                                                    'text-foreground',
                                                                                // Media album needs definite min width:
                                                                                // Bubble is w-fit; min-w-0 + author
                                                                                // label collapses the grid for !mine.
                                                                                comment.attachments.some(
                                                                                    isChatMediaAttachment,
                                                                                )
                                                                                    ? 'min-w-[16rem] gap-0 p-0'
                                                                                    : 'min-w-0',
                                                                            )}
                                                                        >
                                                                            {(() => {
                                                                                const mediaAttachments =
                                                                                    comment.attachments.filter(
                                                                                        isChatMediaAttachment,
                                                                                    );
                                                                                const fileAttachments =
                                                                                    comment.attachments.filter(
                                                                                        (
                                                                                            attachment,
                                                                                        ) =>
                                                                                            !isChatMediaAttachment(
                                                                                                attachment,
                                                                                            ),
                                                                                    );
                                                                                const hasMedia =
                                                                                    mediaAttachments.length >
                                                                                    0;
                                                                                const pad =
                                                                                    hasMedia
                                                                                        ? 'px-3'
                                                                                        : undefined;
                                                                                const onAttachmentSaved =
                                                                                    (
                                                                                        next: ChatAttachment,
                                                                                    ): void => {
                                                                                        const id =
                                                                                            liveChatIdRef.current;

                                                                                        if (
                                                                                            !id
                                                                                        ) {
                                                                                            return;
                                                                                        }

                                                                                        mapMessages(
                                                                                            id,
                                                                                            (
                                                                                                prev,
                                                                                            ) =>
                                                                                                prev.map(
                                                                                                    (
                                                                                                        row,
                                                                                                    ) =>
                                                                                                        row.id ===
                                                                                                        comment.id
                                                                                                            ? {
                                                                                                                  ...row,
                                                                                                                  attachments:
                                                                                                                      row.attachments.map(
                                                                                                                          (
                                                                                                                              item,
                                                                                                                          ) =>
                                                                                                                              item.id ===
                                                                                                                              next.id
                                                                                                                                  ? next
                                                                                                                                  : item,
                                                                                                                      ),
                                                                                                              }
                                                                                                            : row,
                                                                                                ),
                                                                                        );
                                                                                    };

                                                                                return (
                                                                                    <>
                                                                                        {comment.reply_to ? (
                                                                                            <div
                                                                                                className={cn(
                                                                                                    'flex flex-col gap-1',
                                                                                                    pad,
                                                                                                    hasMedia &&
                                                                                                        'pt-2',
                                                                                                )}
                                                                                            >
                                                                                                {comment.reply_to ? (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        className="w-full rounded-md border-l-2 border-border bg-foreground/5 px-2 py-1 text-left"
                                                                                                        onClick={() =>
                                                                                                            scrollToMessage(
                                                                                                                comment
                                                                                                                    .reply_to!
                                                                                                                    .id,
                                                                                                            )
                                                                                                        }
                                                                                                    >
                                                                                                        <div className="text-xs font-medium text-foreground">
                                                                                                            {
                                                                                                                comment
                                                                                                                    .reply_to
                                                                                                                    .user
                                                                                                                    ?.name
                                                                                                            }
                                                                                                        </div>
                                                                                                        <div className="truncate text-xs text-muted-foreground">
                                                                                                            {
                                                                                                                comment
                                                                                                                    .reply_to
                                                                                                                    .body
                                                                                                            }
                                                                                                        </div>
                                                                                                    </button>
                                                                                                ) : null}
                                                                                            </div>
                                                                                        ) : null}
                                                                                        {hasMedia ? (
                                                                                            <ChatMediaGallery
                                                                                                items={
                                                                                                    mediaAttachments
                                                                                                }
                                                                                                scope={
                                                                                                    scope!
                                                                                                }
                                                                                                canCreateFiles={
                                                                                                    canCreateFiles
                                                                                                }
                                                                                                hasFileFields={
                                                                                                    fileFields.length >
                                                                                                    0
                                                                                                }
                                                                                                onSaved={
                                                                                                    onAttachmentSaved
                                                                                                }
                                                                                                onAddToField={(
                                                                                                    attachment,
                                                                                                ) => {
                                                                                                    setAddFieldFor(
                                                                                                        attachment,
                                                                                                    );
                                                                                                    setAddFieldName(
                                                                                                        fileFields[0]
                                                                                                            ?.name ??
                                                                                                            '',
                                                                                                    );
                                                                                                }}
                                                                                            />
                                                                                        ) : null}
                                                                                        <div
                                                                                            className={cn(
                                                                                                'flex flex-col gap-1',
                                                                                                pad,
                                                                                                hasMedia &&
                                                                                                    'pt-1 pb-2',
                                                                                            )}
                                                                                        >
                                                                                            {editingId ===
                                                                                            comment.id ? (
                                                                                                <div className="flex min-w-[12rem] flex-col gap-2">
                                                                                                    <Textarea
                                                                                                        value={
                                                                                                            editingDraft
                                                                                                        }
                                                                                                        onChange={(
                                                                                                            event,
                                                                                                        ) =>
                                                                                                            setEditingDraft(
                                                                                                                event
                                                                                                                    .target
                                                                                                                    .value,
                                                                                                            )
                                                                                                        }
                                                                                                        rows={
                                                                                                            3
                                                                                                        }
                                                                                                    />
                                                                                                    <div className="flex gap-2">
                                                                                                        <Button
                                                                                                            type="button"
                                                                                                            onClick={() =>
                                                                                                                saveEdit(
                                                                                                                    comment,
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {t(
                                                                                                                'common.save',
                                                                                                            )}
                                                                                                        </Button>
                                                                                                        <Button
                                                                                                            type="button"
                                                                                                            variant="ghost"
                                                                                                            onClick={() =>
                                                                                                                setEditingId(
                                                                                                                    null,
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {t(
                                                                                                                'common.cancel',
                                                                                                            )}
                                                                                                        </Button>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ) : comment.body !==
                                                                                              '' ? (
                                                                                                <div className="whitespace-pre-wrap">
                                                                                                    {renderMessageBody(
                                                                                                        comment.body,
                                                                                                        comment.mentioned_users,
                                                                                                        comment.mentioned_collections,
                                                                                                    )}
                                                                                                </div>
                                                                                            ) : null}
                                                                                            {fileAttachments.length >
                                                                                            0 ? (
                                                                                                <ul className="flex max-h-36 w-full min-w-[12rem] flex-col gap-2 overflow-y-auto">
                                                                                                    {fileAttachments.map(
                                                                                                        (
                                                                                                            attachment,
                                                                                                        ) => (
                                                                                                            <li
                                                                                                                key={
                                                                                                                    attachment.id
                                                                                                                }
                                                                                                                className="w-full min-w-0"
                                                                                                            >
                                                                                                                <AttachmentRow
                                                                                                                    attachment={
                                                                                                                        attachment
                                                                                                                    }
                                                                                                                    scope={
                                                                                                                        scope!
                                                                                                                    }
                                                                                                                    canCreateFiles={
                                                                                                                        canCreateFiles
                                                                                                                    }
                                                                                                                    hasFileFields={
                                                                                                                        fileFields.length >
                                                                                                                        0
                                                                                                                    }
                                                                                                                    onSaved={
                                                                                                                        onAttachmentSaved
                                                                                                                    }
                                                                                                                    onAddToField={() => {
                                                                                                                        setAddFieldFor(
                                                                                                                            attachment,
                                                                                                                        );
                                                                                                                        setAddFieldName(
                                                                                                                            fileFields[0]
                                                                                                                                ?.name ??
                                                                                                                                '',
                                                                                                                        );
                                                                                                                    }}
                                                                                                                />
                                                                                                            </li>
                                                                                                        ),
                                                                                                    )}
                                                                                                </ul>
                                                                                            ) : null}
                                                                                            <div className="flex items-center gap-1 self-end">
                                                                                                {comment.is_pinned ? (
                                                                                                    <Pin
                                                                                                        className="size-2.5 shrink-0 text-muted-foreground"
                                                                                                        aria-hidden
                                                                                                    />
                                                                                                ) : null}
                                                                                                <time
                                                                                                    className="text-xs leading-none text-muted-foreground tabular-nums"
                                                                                                    dateTime={
                                                                                                        comment.created_at ??
                                                                                                        undefined
                                                                                                    }
                                                                                                >
                                                                                                    {commentTime(
                                                                                                        comment.created_at,
                                                                                                    )}
                                                                                                </time>
                                                                                            </div>
                                                                                        </div>
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </BubbleContent>
                                                                        <ChatMessageReactions
                                                                            reactions={
                                                                                comment.reactions
                                                                            }
                                                                            align={
                                                                                mine
                                                                                    ? 'end'
                                                                                    : 'start'
                                                                            }
                                                                            onToggle={(
                                                                                emoji,
                                                                            ) =>
                                                                                onReact(
                                                                                    comment,
                                                                                    emoji,
                                                                                )
                                                                            }
                                                                        />
                                                                    </Bubble>
                                                                </ChatMessageContextMenu>
                                                                <ChatMessageActionsButton
                                                                    actions={messageActionsFor(
                                                                        comment,
                                                                    )}
                                                                    align={
                                                                        mine
                                                                            ? 'end'
                                                                            : 'start'
                                                                    }
                                                                />
                                                            </div>
                                                        </MessageContent>
                                                    </Message>
                                                </div>
                                            </MessageScrollerItem>
                                        );
                                    },
                                )}
                            </MessageGroup>
                        ))}
                        {pendingMessages.map((pending) => (
                            <ChatOutgoingAttachPreview
                                key={pending.clientId}
                                pending={pending}
                                renderBody={renderMessageBody}
                                onRetry={retryPending}
                                onRemoveFile={removePendingFile}
                            />
                        ))}
                    </ChatMessageScroller>
                </div>
                <DrawerFooter
                    // In the hub pane, match the assistant page's composer inset.
                    className={variant === 'pane' ? 'p-3' : undefined}
                >
                    {replyTo ? (
                        <div className="flex items-start gap-2 rounded-md bg-muted/60 px-2 py-2">
                            <div className="min-w-0 flex-1 border-l-2 border-border pl-2 text-xs">
                                <div className="font-medium text-foreground">
                                    {replyTo.user?.name}
                                </div>
                                <div className="truncate text-muted-foreground">
                                    {storedBodyToDraft(
                                        replyTo.body,
                                        replyTo.mentioned_users,
                                    )}
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-6 px-1"
                                onClick={() => setReplyTo(null)}
                            >
                                {t('common.cancel')}
                            </Button>
                        </div>
                    ) : null}
                    <ChatMentionMenu
                        {...mentionMenu}
                        open={mentionMenu.isOpen}
                        renderHit={(hit) => <ChatMentionHitLabel hit={hit} />}
                        textareaRef={textareaRef}
                    >
                        <ChatComposer
                            textareaRef={textareaRef}
                            value={draft}
                            onValueChange={onComposerChange}
                            onSubmit={send}
                            canSubmit={draft.trim() !== '' && !attachDialogOpen}
                            placeholder={t('collections.itemChat.placeholder')}
                            label={t('collections.itemChat.placeholder')}
                            sendLabel={t('collections.itemChat.send')}
                            textareaTestId="item-chat-composer"
                            submitTestId="item-chat-send"
                            onKeyDown={(event) => {
                                if (
                                    mentionsEnabled &&
                                    handleMentionMenuKeyDown(event, mentionMenu)
                                ) {
                                    return;
                                }

                                if (event.key === ' ' && event.shiftKey) {
                                    event.preventDefault();
                                    insertAtCaret('\n');
                                }
                            }}
                            actions={
                                <>
                                    {mentionsEnabled ? (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            aria-label={t(
                                                'collections.itemChat.mention',
                                            )}
                                            onClick={insertMentionTrigger}
                                        >
                                            @
                                        </Button>
                                    ) : null}
                                    <Popover
                                        open={emojiOpen}
                                        onOpenChange={setEmojiOpen}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label={t(
                                                    'collections.itemChat.emoji',
                                                )}
                                            >
                                                <Smile className="size-4" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className="w-64 p-2"
                                            align="start"
                                        >
                                            <div className="grid grid-cols-8 gap-1">
                                                {EMOJI_GRID.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        className="rounded p-1 text-lg hover:bg-muted"
                                                        onClick={() => {
                                                            insertAtCaret(
                                                                emoji,
                                                            );
                                                            setEmojiOpen(false);
                                                        }}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={t(
                                            'collections.itemChat.attach',
                                        )}
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                    >
                                        <Paperclip className="size-4" />
                                    </Button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        multiple
                                        onChange={(event) => {
                                            onPickFiles(event.target.files);
                                            event.target.value = '';
                                        }}
                                    />
                                </>
                            }
                        />
                    </ChatMentionMenu>
                </DrawerFooter>
                {composerDragOver ? (
                    <div
                        className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10"
                        aria-hidden
                    >
                        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-lg">
                            <Paperclip className="size-4" />
                            {t('collections.itemChat.dropToAttach')}
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );

    return (
        <>
            {variant === 'pane' ? (
                open ? (
                    <div
                        data-test="chat-thread-pane"
                        className="flex h-full min-h-0 flex-col overflow-hidden"
                    >
                        {threadShell}
                    </div>
                ) : null
            ) : (
                <Drawer
                    open={open}
                    onOpenChange={onOpenChange ?? (() => undefined)}
                    direction="right"
                    dismissible
                >
                    <DrawerContent
                        data-test="item-chat-drawer"
                        className="data-[vaul-drawer-direction=right]:max-w-md"
                        aria-label={
                            thread?.title ?? t('collections.itemChat.title')
                        }
                    >
                        {threadShell}
                    </DrawerContent>
                </Drawer>
            )}

            {attachDialogOpen && attachItems.length > 0 ? (
                <ChatSendAttachmentsDialog
                    open
                    items={attachItems}
                    caption={attachCaption}
                    sending={false}
                    captionRef={captionTextareaRef}
                    mentionOpen={mentionOpen}
                    mentionHits={mentionHits}
                    mentionHighlight={mentionHighlight}
                    emojiOpen={emojiOpen}
                    emojis={EMOJI_GRID}
                    onCaptionChange={onComposerChange}
                    onMentionHighlight={setMentionHighlight}
                    onPickMention={pickMention}
                    onDismissMention={() => {
                        setMentionOpen(false);
                        setMentionStart(null);
                    }}
                    onInsertMentionTrigger={insertMentionTrigger}
                    onInsertEmoji={(emoji) => {
                        insertAtCaret(emoji);
                        setEmojiOpen(false);
                    }}
                    onEmojiOpenChange={setEmojiOpen}
                    onAddFiles={onPickFiles}
                    onRemove={removeAttachItem}
                    onClose={closeAttachDialog}
                    onSend={sendAttachBatch}
                    mentionsEnabled={mentionsEnabled}
                />
            ) : null}

            <Dialog
                open={addFieldFor !== null}
                onOpenChange={(next) => {
                    if (!next) {
                        setAddFieldFor(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('collections.itemChat.addToFieldTitle')}
                        </DialogTitle>
                    </DialogHeader>
                    {fileFields.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('collections.itemChat.noFileFields')}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="item-chat-add-field">
                                {t('collections.itemChat.selectField')}
                            </Label>
                            <NativeSelect
                                id="item-chat-add-field"
                                className="w-full"
                                value={addFieldName}
                                onChange={(event) =>
                                    setAddFieldName(event.target.value)
                                }
                            >
                                {fileFields.map((field) => (
                                    <option key={field.id} value={field.name}>
                                        {field.name} ({field.type})
                                    </option>
                                ))}
                            </NativeSelect>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setAddFieldFor(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            disabled={
                                addFieldFor === null ||
                                addFieldName === '' ||
                                fileFields.length === 0
                            }
                            onClick={() => {
                                if (
                                    addFieldFor === null ||
                                    addFieldName === ''
                                ) {
                                    return;
                                }

                                void addChatAttachmentToField(
                                    scope!,
                                    addFieldFor.id,
                                    addFieldName,
                                )
                                    .then(() => setAddFieldFor(null))
                                    .catch((err: unknown) => {
                                        setError(
                                            err instanceof Error
                                                ? err.message
                                                : t(
                                                      'collections.itemChat.sendError',
                                                  ),
                                        );
                                    });
                            }}
                        >
                            {t('collections.itemChat.addToField')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function isChatMediaAttachment(attachment: ChatAttachment): boolean {
    return (
        attachment.mime.startsWith('image/') ||
        attachment.mime.startsWith('video/')
    );
}

function ChatMediaGallery({
    items,
    scope,
    canCreateFiles,
    hasFileFields,
    onSaved,
    onAddToField,
}: {
    items: ChatAttachment[];
    scope: ChatScope;
    canCreateFiles: boolean;
    hasFileFields: boolean;
    onSaved: (attachment: ChatAttachment) => void;
    onAddToField: (attachment: ChatAttachment) => void;
}) {
    const { t } = useTranslation();
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    if (items.length === 0) {
        return null;
    }

    return (
        <>
            <ChatMediaAlbum
                items={items.map((attachment) => ({
                    key: attachment.id,
                    src: chatAttachmentPreviewUrl(scope, attachment),
                    isVideo: attachment.mime.startsWith('video/'),
                    name: attachment.name,
                }))}
                mediaPreviewLabel={t('collections.itemChat.mediaPreview')}
                onMediaClick={setLightboxIndex}
                renderOverlay={(_, index) => {
                    const attachment = items[index]!;
                    const originalHref = chatAttachmentUrl(
                        scope,
                        attachment.id,
                    );

                    return (
                        <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/media:opacity-100 focus-within:opacity-100">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="secondary"
                                        className="size-7 bg-background/80 shadow-sm backdrop-blur"
                                        aria-label={t(
                                            'collections.itemChat.more',
                                        )}
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                        onContextMenu={(event) =>
                                            event.stopPropagation()
                                        }
                                    >
                                        <MoreVertical className="size-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                        <a
                                            href={originalHref}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {t('collections.itemChat.download')}
                                        </a>
                                    </DropdownMenuItem>
                                    {canCreateFiles ? (
                                        <DropdownMenuItem
                                            onSelect={() => {
                                                void saveChatAttachmentToFiles(
                                                    scope,
                                                    attachment.id,
                                                ).then((payload) =>
                                                    onSaved(payload.attachment),
                                                );
                                            }}
                                        >
                                            {t(
                                                'collections.itemChat.saveToFiles',
                                            )}
                                        </DropdownMenuItem>
                                    ) : null}
                                    {hasFileFields ? (
                                        <DropdownMenuItem
                                            onSelect={() =>
                                                onAddToField(attachment)
                                            }
                                        >
                                            {t(
                                                'collections.itemChat.addToField',
                                            )}
                                        </DropdownMenuItem>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                }}
            />

            <ChatMediaLightbox
                open={lightboxIndex !== null}
                items={items}
                initialIndex={lightboxIndex ?? 0}
                scope={scope}
                onOpenChange={(next) => {
                    if (!next) {
                        setLightboxIndex(null);
                    }
                }}
            />
        </>
    );
}

function AttachmentRow({
    attachment,
    scope,
    canCreateFiles,
    hasFileFields,
    onSaved,
    onAddToField,
}: {
    attachment: ChatAttachment;
    scope: ChatScope;
    canCreateFiles: boolean;
    hasFileFields: boolean;
    onSaved: (attachment: ChatAttachment) => void;
    onAddToField: () => void;
}) {
    const { t } = useTranslation();
    const href = chatAttachmentUrl(scope, attachment.id);

    return (
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-sm">
            <a
                href={href}
                className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-foreground no-underline hover:underline"
                target="_blank"
                rel="noreferrer"
            >
                <FileText
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                />
                <span className="truncate">{attachment.name}</span>
            </a>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0 text-muted-foreground"
                        aria-label={t('collections.itemChat.more')}
                        onContextMenu={(event) => event.stopPropagation()}
                    >
                        <MoreVertical className="size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <a href={href} target="_blank" rel="noreferrer">
                            {t('collections.itemChat.download')}
                        </a>
                    </DropdownMenuItem>
                    {canCreateFiles ? (
                        <DropdownMenuItem
                            onSelect={() => {
                                void saveChatAttachmentToFiles(
                                    scope,
                                    attachment.id,
                                ).then((payload) =>
                                    onSaved(payload.attachment),
                                );
                            }}
                        >
                            {t('collections.itemChat.saveToFiles')}
                        </DropdownMenuItem>
                    ) : null}
                    {hasFileFields ? (
                        <DropdownMenuItem onSelect={onAddToField}>
                            {t('collections.itemChat.addToField')}
                        </DropdownMenuItem>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
