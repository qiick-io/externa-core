import { Link, usePage } from '@inertiajs/react';
import {
    CheckSquare,
    Copy,
    Forward,
    Loader2,
    MoreVertical,
    Paperclip,
    Pin,
    Reply,
    Send,
    Smile,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import { ChatThreadHeader } from '@/components/chat/chat-thread-header';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerFooter,
} from '@/components/ui/drawer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Message,
    MessageAvatar,
    MessageContent,
} from '@/components/ui/message';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { avatarColorForId, avatarStyleForId } from '@/lib/avatar-color';
import type { ChatThreadIdentity } from '@/lib/chat-thread-identity';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import {
    addChatAttachmentToField,
    applyReactionToggle,
    chatAttachmentUrl,
    deleteMessage,
    fetchMentions,
    fetchMessages,
    forwardMessage,
    markChatRead,
    patchMessage,
    pinMessage,
    postMessage,
    putChatNotify,
    REACTION_EMOJIS,
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
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types/collections';

type UploadingFile = { key: string; name: string };

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

const FILE_FIELD_TYPES = new Set(['image', 'file', 'files']);
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

function initials(name: string): string {
    const parts = name.trim().split(/\s+/);

    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

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

    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function commentTime(iso: string | null): string {
    if (!iso) {
        return '';
    }

    return new Date(iso).toLocaleTimeString(undefined, {
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

    const [messages, setMessages] = useState<ItemChatMessage[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [notify, setNotify] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [pendingAttachments, setPendingAttachments] = useState<
        ChatAttachment[]
    >([]);
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
    const [composerDragOver, setComposerDragOver] = useState(false);
    const [mentionedUsers, setMentionedUsers] = useState<ChatUser[]>([]);
    const [mentionedCollections, setMentionedCollections] = useState<
        ChatCollection[]
    >([]);
    const [sending, setSending] = useState(false);
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
    const [pinned, setPinned] = useState<ChatPinned[]>([]);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [forwardOpen, setForwardOpen] = useState(false);
    const [forwardItemId, setForwardItemId] = useState('');
    const [forwardIds, setForwardIds] = useState<number[]>([]);
    const [forwarding, setForwarding] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const uploadGen = useRef(0);
    const loadGen = useRef(0);
    const whisperAt = useRef(0);
    const typingExpiry = useRef<Map<number, number>>(new Map());
    const messagesRef = useRef(messages);
    const chatCountRef = useRef(chatCount);
    const onChatCountChangeRef = useRef(onChatCountChange);
    const presenceRef = useRef<{
        whisper: (event: string, data: Record<string, unknown>) => void;
    } | null>(null);

    useEffect(() => {
        messagesRef.current = messages;
    });

    chatCountRef.current = chatCount;
    onChatCountChangeRef.current = onChatCountChange;

    const scopeKey =
        scope?.mode === 'hub'
            ? `hub:${scope.chatId}`
            : scope
              ? `item:${scope.collectionId}:${scope.itemId}`
              : null;

    const load = useCallback(
        (beforeId?: number): void => {
            if (beforeId) {
                setLoadingMore(true);
            } else if (messagesRef.current.length === 0) {
                setLoading(true);
            }

            if (!scope) {
                setLoading(false);
                setLoadingMore(false);

                return;
            }

            const gen = ++loadGen.current;
            setError(null);

            void fetchMessages(scope, { beforeId })
                .then((payload) => {
                    if (gen !== loadGen.current) {
                        return;
                    }

                    setHasMore(payload.meta.has_more);
                    setNotify(payload.meta.notify);
                    onChatCountChangeRef.current(payload.meta.total);
                    setPinned(payload.pinned ?? []);

                    if (payload.meta.chat_id) {
                        setLiveChatId(payload.meta.chat_id);
                    }

                    if (beforeId) {
                        setMessages((prev) => {
                            const seen = new Set(prev.map((row) => row.id));
                            const older = payload.messages.filter(
                                (row) => !seen.has(row.id),
                            );

                            return [...older, ...prev];
                        });
                    } else {
                        setMessages(payload.messages);
                    }
                })
                .catch(() => {
                    if (gen !== loadGen.current) {
                        return;
                    }

                    setError(t('collections.itemChat.error'));

                    if (!beforeId) {
                        setMessages([]);
                    }
                })
                .finally(() => {
                    if (gen !== loadGen.current) {
                        return;
                    }

                    setLoading(false);
                    setLoadingMore(false);
                });
        },
        [scope, t],
    );

    useEffect(() => {
        setLiveChatId(chatId);
    }, [chatId]);

    useEffect(() => {
        if (!open) {
            uploadGen.current += 1;
            setUploadingFiles([]);
            setComposerDragOver(false);

            return;
        }

        setDraft('');
        setPendingAttachments([]);
        setUploadingFiles([]);
        setMentionedUsers([]);
        setEditingId(null);
        setReplyTo(null);
        setSelectMode(false);
        setSelectedIds([]);
        setTypingNames([]);
        setMessages([]);
        setPinned([]);
        setHasMore(false);
        setLoading(true);
        load();
        // scopeKey covers scope identity; load is intentionally omitted.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when thread changes
    }, [open, scopeKey]);

    useEffect(() => {
        if (!open || !scope || variant === 'pane') {
            return;
        }

        void markChatRead(scope).catch(() => {
            // Missing thread (item alias before first message) is a no-op.
        });
    }, [open, scopeKey, variant]);

    useEffect(() => {
        setMentionHighlight(0);
    }, [mentionHits]);

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

                setMessages((prev) => {
                    if (prev.some((row) => row.id === next.id)) {
                        return prev;
                    }

                    onChatCountChangeRef.current(prev.length + 1);

                    return [...prev, next];
                });

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

                setMessages((prev) =>
                    prev.map((row) => (row.id === next.id ? next : row)),
                );
                setPinned((prev) => {
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

            setMessages((prev) => prev.filter((row) => row.id !== id));
            setPinned((prev) => prev.filter((row) => row.id !== id));
            onChatCountChangeRef.current(Math.max(0, chatCountRef.current - 1));
        });
        channel.listen(
            '.ReactionToggled',
            (event: {
                message_id?: number;
                user_id?: number;
                emoji?: string;
                added?: boolean;
            }) => {
                const messageId = event.message_id;
                const emoji = event.emoji;

                if (!messageId || !emoji) {
                    return;
                }

                const isOwn = event.user_id === viewerId;

                if (isOwn) {
                    return;
                }

                setMessages((prev) =>
                    prev.map((row) =>
                        row.id === messageId
                            ? {
                                  ...row,
                                  reactions: applyReactionToggle(
                                      row.reactions,
                                      emoji,
                                      event.added === true,
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
    }, [open, realtimeOn, liveChatId, viewerId, scopeKey]);

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

    const insertAtCaret = (text: string, extraMention?: number): void => {
        const el = textareaRef.current;
        const start = el?.selectionStart ?? draft.length;
        const end = el?.selectionEnd ?? draft.length;
        const next = draft.slice(0, start) + text + draft.slice(end);
        setDraft(next);

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

    const onDraftChange = (value: string, caret: number): void => {
        setDraft(value);
        whisperTyping();

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
        const el = textareaRef.current;
        const caret = el?.selectionStart ?? draft.length;
        const start =
            mentionStart ?? mentionQueryAt(draft, caret)?.start ?? caret;
        const label =
            hit.type === 'collection'
                ? `${collectionMentionLabel(hit)} `
                : `${mentionDisplayLabel(hit)} `;
        const next = draft.slice(0, start) + label + draft.slice(caret);
        setDraft(next);

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

    const send = (): void => {
        const trimmed = draft.trim();
        const { body, mentionedIds } = composeBodyForSubmit(
            trimmed,
            mentionedUsers,
            mentionedCollections,
        );

        if (
            (body === '' && pendingAttachments.length === 0) ||
            sending ||
            uploadingFiles.length > 0
        ) {
            return;
        }

        setSending(true);
        setError(null);

        if (!scope) {
            return;
        }

        void postMessage(scope, {
            body,
            mentioned_user_ids: mentionedIds,
            attachment_ids: pendingAttachments.map((row) => row.id),
            reply_to_id: replyTo?.id ?? null,
        })
            .then((message) => {
                setMessages((prev) =>
                    prev.some((row) => row.id === message.id)
                        ? prev
                        : [...prev, message],
                );
                onChatCountChangeRef.current(chatCount + 1);
                setDraft('');
                setPendingAttachments([]);
                setMentionedUsers([]);
                setMentionedCollections([]);
                setReplyTo(null);

                if (!liveChatId || !realtimeOn) {
                    load();
                }
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.sendError'),
                );
            })
            .finally(() => setSending(false));
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
                setMessages((prev) =>
                    prev.map((row) => (row.id === next.id ? next : row)),
                );
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
                setMessages((prev) =>
                    prev.filter((row) => row.id !== comment.id),
                );
                setPinned((prev) =>
                    prev.filter((row) => row.id !== comment.id),
                );
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
        document
            .querySelector(`[data-message-id="${id}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const copyMessageText = (message: ItemChatMessage): void => {
        const text = storedBodyToDraft(message.body, message.mentioned_users);
        void navigator.clipboard.writeText(text);
    };

    const onReact = (message: ItemChatMessage, emoji: string): void => {
        const existing = message.reactions.find((row) => row.emoji === emoji);
        const added = !(existing?.reacted ?? false);

        setMessages((prev) =>
            prev.map((row) =>
                row.id === message.id
                    ? {
                          ...row,
                          reactions: applyReactionToggle(
                              row.reactions,
                              emoji,
                              added,
                              true,
                          ),
                      }
                    : row,
            ),
        );

        void toggleReaction(scope, message.id, emoji).catch((err: unknown) => {
            setError(
                err instanceof Error
                    ? err.message
                    : t('collections.itemChat.error'),
            );
            load();
        });
    };

    const onPin = (message: ItemChatMessage): void => {
        const nextPinned = !message.is_pinned;
        void pinMessage(scope, message.id, nextPinned)
            .then((updated) => {
                setMessages((prev) =>
                    prev.map((row) => (row.id === updated.id ? updated : row)),
                );
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.error'),
                );
            });
    };

    const openForward = (ids: number[]): void => {
        setForwardIds(ids);
        setForwardItemId('');
        setForwardOpen(true);
    };

    const confirmForward = (): void => {
        const targetId = Number(forwardItemId);

        if (!Number.isInteger(targetId) || targetId < 1) {
            return;
        }

        setForwarding(true);
        void Promise.all(
            forwardIds.map((id) => forwardMessage(scope, id, targetId)),
        )
            .then(() => {
                setForwardOpen(false);
                setSelectMode(false);
                setSelectedIds([]);
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.forwardError'),
                );
            })
            .finally(() => setForwarding(false));
    };

    const toggleSelected = (id: number): void => {
        setSelectedIds((prev) =>
            prev.includes(id)
                ? prev.filter((row) => row !== id)
                : [...prev, id],
        );
    };

    const copySelected = (): void => {
        const texts = messages
            .filter((row) => selectedIds.includes(row.id))
            .map((row) => storedBodyToDraft(row.body, row.mentioned_users));
        void navigator.clipboard.writeText(texts.join('\n\n'));
    };

    const deleteSelected = (): void => {
        const rows = messages.filter((row) => selectedIds.includes(row.id));

        if (rows.length === 0 || rows.some((row) => !row.can_delete)) {
            return;
        }

        void Promise.all(rows.map((row) => deleteMessage(scope, row.id)))
            .then(() => {
                const ids = new Set(rows.map((row) => row.id));
                setMessages((prev) => prev.filter((row) => !ids.has(row.id)));
                setPinned((prev) => prev.filter((row) => !ids.has(row.id)));
                onChatCountChangeRef.current(Math.max(0, chatCount - rows.length));
                setSelectMode(false);
                setSelectedIds([]);
            })
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.error'),
                );
            });
    };

    const selectedRows = messages.filter((row) => selectedIds.includes(row.id));
    const canDeleteSelected =
        selectedRows.length > 0 && selectedRows.every((row) => row.can_delete);

    const onPickFiles = (fileList: FileList | File[] | null): void => {
        if (!fileList || sending) {
            return;
        }

        const files = Array.from(fileList);

        if (files.length === 0) {
            return;
        }

        const gen = uploadGen.current;
        const staged = files.map((file, index) => ({
            key: `${Date.now()}-${index}-${file.name}-${file.size}`,
            name: file.name,
            file,
        }));

        setUploadingFiles((prev) => [
            ...prev,
            ...staged.map(({ key, name }) => ({ key, name })),
        ]);

        void Promise.all(
            staged.map(({ file }) => uploadChatAttachment(scope, file)),
        )
            .then((uploaded) => {
                if (gen !== uploadGen.current) {
                    return;
                }

                setPendingAttachments((prev) => [...prev, ...uploaded]);
            })
            .catch((err: unknown) => {
                if (gen !== uploadGen.current) {
                    return;
                }

                setError(
                    err instanceof Error
                        ? err.message
                        : t('collections.itemChat.sendError'),
                );
            })
            .finally(() => {
                if (gen !== uploadGen.current) {
                    return;
                }

                const stagedKeys = new Set(staged.map((row) => row.key));
                setUploadingFiles((prev) =>
                    prev.filter((row) => !stagedKeys.has(row.key)),
                );
            });
    };

    const clearComposerDrag = (): void => {
        setComposerDragOver(false);
    };

    const onComposerDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        if (sending || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        setComposerDragOver(true);
    };

    const onComposerDragOver = (event: DragEvent<HTMLDivElement>): void => {
        if (sending || !isExternalFileDrag(event)) {
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
        if (sending || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearComposerDrag();
        onPickFiles(event.dataTransfer.files);
    };

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
                    <div className="relative flex min-h-0 flex-1 flex-col">
                    <DrawerBody className="flex flex-col gap-3 pb-8">
                        {hasMore ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={loading || loadingMore}
                                onClick={() => load(messages[0]?.id)}
                            >
                                {loadingMore
                                    ? t('collections.itemChat.loading')
                                    : t('collections.itemChat.loadOlder')}
                            </Button>
                        ) : null}
                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : null}
                        {!loading && messages.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center">
                                <p className="text-sm text-muted-foreground">
                                    {t('collections.itemChat.empty')}
                                </p>
                            </div>
                        ) : null}
                        {pinned.length > 0 ? (
                            <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2">
                                {pinned.map((row) => {
                                    const pinnedUserId = row.user?.id ?? 0;

                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            className="flex items-center gap-2 text-left text-xs"
                                            onClick={() => scrollToMessage(row.id)}
                                        >
                                            <Pin className="size-3 shrink-0 text-muted-foreground" />
                                            <span className="min-w-0 truncate">
                                                <span
                                                    className="font-medium"
                                                    style={{
                                                        color: avatarColorForId(
                                                            pinnedUserId,
                                                        ),
                                                    }}
                                                >
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
                        {messages.map((comment, index) => {
                            const userId = comment.user?.id ?? 0;
                            const mine = comment.user?.id === viewerId;
                            const prevDay = dayLabel(
                                messages[index - 1]?.created_at ?? null,
                            );
                            const thisDay = dayLabel(comment.created_at);
                            const showDay =
                                thisDay !== '' && thisDay !== prevDay;

                            return (
                                <div key={comment.id}>
                                    {showDay ? (
                                        <p className="mb-2 text-center text-xs text-muted-foreground">
                                            {thisDay}
                                        </p>
                                    ) : null}
                                    <div
                                        data-message-id={comment.id}
                                        className="flex items-start gap-2"
                                    >
                                        {selectMode ? (
                                            <Checkbox
                                                className="mt-2"
                                                checked={selectedIds.includes(
                                                    comment.id,
                                                )}
                                                onCheckedChange={() =>
                                                    toggleSelected(comment.id)
                                                }
                                                aria-label={t(
                                                    'collections.itemChat.select',
                                                )}
                                            />
                                        ) : null}
                                        <Message align={mine ? 'end' : 'start'}>
                                            {!mine ? (
                                                <MessageAvatar
                                                    className="size-8 text-[10px] font-medium"
                                                    style={avatarStyleForId(
                                                        userId,
                                                    )}
                                                >
                                                    {initials(
                                                        comment.user?.name ??
                                                            '?',
                                                    )}
                                                </MessageAvatar>
                                            ) : null}
                                            <MessageContent>
                                                <MessageActionsMenu
                                                    canEdit={comment.can_edit}
                                                    canDelete={
                                                        comment.can_delete
                                                    }
                                                    isPinned={comment.is_pinned}
                                                    disabled={selectMode}
                                                    onReply={() => {
                                                        setReplyTo(comment);
                                                        textareaRef.current?.focus();
                                                    }}
                                                    onCopy={() =>
                                                        copyMessageText(comment)
                                                    }
                                                    onPin={() => onPin(comment)}
                                                    onForward={() =>
                                                        openForward([
                                                            comment.id,
                                                        ])
                                                    }
                                                    onSelect={() => {
                                                        setSelectMode(true);
                                                        setSelectedIds([
                                                            comment.id,
                                                        ]);
                                                    }}
                                                    onReact={(emoji) =>
                                                        onReact(comment, emoji)
                                                    }
                                                    onEdit={() => {
                                                        setEditingId(
                                                            comment.id,
                                                        );
                                                        setEditingDraft(
                                                            storedBodyToDraft(
                                                                comment.body,
                                                                comment.mentioned_users,
                                                            ),
                                                        );
                                                    }}
                                                    onDelete={() =>
                                                        removeMessage(comment)
                                                    }
                                                >
                                                    <Bubble
                                                        variant="muted"
                                                        align={
                                                            mine
                                                                ? 'end'
                                                                : 'start'
                                                        }
                                                    >
                                                        <BubbleContent
                                                            className={cn(
                                                                'flex w-full min-w-0 flex-col gap-1',
                                                                mine &&
                                                                    'text-foreground',
                                                            )}
                                                        >
                                                            {!mine ? (
                                                                <div
                                                                    className="text-xs font-bold"
                                                                    style={{
                                                                        color: avatarColorForId(
                                                                            userId,
                                                                        ),
                                                                    }}
                                                                >
                                                                    {
                                                                        comment
                                                                            .user
                                                                            ?.name
                                                                    }
                                                                </div>
                                                            ) : null}
                                                            {comment.forwarded_from ? (
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {t(
                                                                        'collections.itemChat.forwardedFrom',
                                                                        {
                                                                            name: comment
                                                                                .forwarded_from
                                                                                .author_name,
                                                                        },
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                            {comment.reply_to ? (
                                                                <button
                                                                    type="button"
                                                                    className="w-full rounded-md bg-black/5 px-2 py-1 text-left dark:bg-white/5"
                                                                    style={{
                                                                        borderLeftWidth: 2,
                                                                        borderLeftColor:
                                                                            avatarColorForId(
                                                                                comment
                                                                                    .reply_to
                                                                                    .user
                                                                                    ?.id ??
                                                                                    0,
                                                                            ),
                                                                    }}
                                                                    onClick={() =>
                                                                        scrollToMessage(
                                                                            comment
                                                                                .reply_to!
                                                                                .id,
                                                                        )
                                                                    }
                                                                >
                                                                    <div
                                                                        className="text-[11px] font-medium"
                                                                        style={{
                                                                            color: avatarColorForId(
                                                                                comment
                                                                                    .reply_to
                                                                                    .user
                                                                                    ?.id ??
                                                                                    0,
                                                                            ),
                                                                        }}
                                                                    >
                                                                        {
                                                                            comment
                                                                                .reply_to
                                                                                .user
                                                                                ?.name
                                                                        }
                                                                    </div>
                                                                    <div className="truncate text-[11px] text-muted-foreground">
                                                                        {
                                                                            comment
                                                                                .reply_to
                                                                                .body
                                                                        }
                                                                    </div>
                                                                </button>
                                                            ) : null}
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
                                                                        rows={3}
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
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
                                                                            size="sm"
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
                                                            {comment.attachments
                                                                .length > 0 ? (
                                                                <ul className="flex max-h-36 w-full min-w-[12rem] flex-col gap-1 overflow-y-auto">
                                                                    {comment.attachments.map(
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
                                                                                    onSaved={(
                                                                                        next,
                                                                                    ) => {
                                                                                        setMessages(
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
                                                                                    }}
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
                                                                    className="text-[10px] leading-none text-muted-foreground tabular-nums"
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
                                                            {comment.reactions
                                                                .length > 0 ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {comment.reactions.map(
                                                                        (
                                                                            reaction,
                                                                        ) => (
                                                                            <button
                                                                                key={
                                                                                    reaction.emoji
                                                                                }
                                                                                type="button"
                                                                                className={cn(
                                                                                    'rounded-full border px-1.5 py-0.5 text-[11px] leading-none',
                                                                                    reaction.reacted
                                                                                        ? 'border-primary bg-primary/10'
                                                                                        : 'border-border',
                                                                                )}
                                                                                onClick={() =>
                                                                                    onReact(
                                                                                        comment,
                                                                                        reaction.emoji,
                                                                                    )
                                                                                }
                                                                            >
                                                                                {
                                                                                    reaction.emoji
                                                                                }{' '}
                                                                                {
                                                                                    reaction.count
                                                                                }
                                                                            </button>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                        </BubbleContent>
                                                    </Bubble>
                                                </MessageActionsMenu>
                                            </MessageContent>
                                        </Message>
                                    </div>
                                </div>
                            );
                        })}
                    </DrawerBody>
                        {loading || typingLabel ? (
                            <div
                                data-test="chat-thread-status"
                                className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center gap-1"
                            >
                                {loading ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Spinner className="size-4" />
                                        {t('collections.itemChat.loading')}
                                    </div>
                                ) : null}
                                {typingLabel ? (
                                    <p className="text-xs text-muted-foreground">
                                        {typingLabel}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                    <DrawerFooter
                        className={cn(
                            'relative',
                            composerDragOver && 'bg-primary/5',
                        )}
                        onDragEnter={onComposerDragEnter}
                        onDragOver={onComposerDragOver}
                        onDragLeave={onComposerDragLeave}
                        onDrop={onComposerDrop}
                    >
                        {selectMode ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={selectedIds.length === 0}
                                    onClick={copySelected}
                                >
                                    {t('collections.itemChat.copyText')}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={selectedIds.length === 0}
                                    onClick={() => openForward(selectedIds)}
                                >
                                    {t('collections.itemChat.forward')}
                                </Button>
                                {canDeleteSelected ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        onClick={deleteSelected}
                                    >
                                        {t('common.delete')}
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto"
                                    onClick={() => {
                                        setSelectMode(false);
                                        setSelectedIds([]);
                                    }}
                                >
                                    {t('common.cancel')}
                                </Button>
                            </div>
                        ) : null}
                        <div className={selectMode ? 'hidden' : 'contents'}>
                            {uploadingFiles.length > 0 ||
                            pendingAttachments.length > 0 ? (
                                <ul className="space-y-1 text-xs">
                                    {uploadingFiles.map((file) => (
                                        <li
                                            key={file.key}
                                            className="flex items-center justify-between gap-2"
                                        >
                                            <span className="truncate">
                                                {file.name}
                                            </span>
                                            <Loader2
                                                className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                                                aria-label={t(
                                                    'collections.itemChat.uploading',
                                                )}
                                            />
                                        </li>
                                    ))}
                                    {pendingAttachments.map((attachment) => (
                                        <li
                                            key={attachment.id}
                                            className="flex items-center justify-between gap-2"
                                        >
                                            <span className="truncate">
                                                {attachment.name}
                                            </span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-1"
                                                onClick={() =>
                                                    setPendingAttachments(
                                                        (prev) =>
                                                            prev.filter(
                                                                (row) =>
                                                                    row.id !==
                                                                    attachment.id,
                                                            ),
                                                    )
                                                }
                                            >
                                                {t('common.delete')}
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {replyTo ? (
                                <div className="flex items-start gap-2 rounded-md bg-muted/60 px-2 py-1.5">
                                    <div
                                        className="min-w-0 flex-1 border-l-2 pl-2 text-xs"
                                        style={{
                                            borderColor: avatarColorForId(
                                                replyTo.user?.id ?? 0,
                                            ),
                                        }}
                                    >
                                        <div
                                            className="font-medium"
                                            style={{
                                                color: avatarColorForId(
                                                    replyTo.user?.id ?? 0,
                                                ),
                                            }}
                                        >
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
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-1"
                                        onClick={() => setReplyTo(null)}
                                    >
                                        {t('common.cancel')}
                                    </Button>
                                </div>
                            ) : null}
                            <div className="relative">
                                {mentionOpen && mentionHits.length > 0 ? (
                                    <div className="absolute inset-x-0 bottom-full z-20 mb-1 max-h-40 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                                        {mentionHits.map((hit, index) => (
                                            <button
                                                key={`${hit.type}-${hit.id}`}
                                                type="button"
                                                className={
                                                    index === mentionHighlight
                                                        ? 'flex w-full flex-col items-start rounded bg-muted px-2 py-1 text-left text-sm'
                                                        : 'flex w-full flex-col items-start rounded px-2 py-1 text-left text-sm hover:bg-muted'
                                                }
                                                onMouseEnter={() =>
                                                    setMentionHighlight(index)
                                                }
                                                onClick={() => pickMention(hit)}
                                            >
                                                <span>
                                                    {hit.type === 'collection'
                                                        ? collectionMentionLabel(
                                                              hit,
                                                          )
                                                        : hit.name}
                                                </span>
                                                {hit.type === 'user' &&
                                                hit.email ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        {hit.email}
                                                    </span>
                                                ) : hit.type ===
                                                  'collection' ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        collection
                                                    </span>
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                <Textarea
                                    ref={textareaRef}
                                    value={draft}
                                    rows={3}
                                    placeholder={t(
                                        'collections.itemChat.placeholder',
                                    )}
                                    data-test="item-chat-composer"
                                    onChange={(event) =>
                                        onDraftChange(
                                            event.target.value,
                                            event.target.selectionStart,
                                        )
                                    }
                                    onKeyDown={(event) => {
                                        if (event.nativeEvent.isComposing) {
                                            return;
                                        }

                                        if (
                                            mentionOpen &&
                                            mentionHits.length > 0
                                        ) {
                                            if (event.key === 'ArrowDown') {
                                                event.preventDefault();
                                                setMentionHighlight(
                                                    (index) =>
                                                        (index + 1) %
                                                        mentionHits.length,
                                                );

                                                return;
                                            }

                                            if (event.key === 'ArrowUp') {
                                                event.preventDefault();
                                                setMentionHighlight(
                                                    (index) =>
                                                        (index -
                                                            1 +
                                                            mentionHits.length) %
                                                        mentionHits.length,
                                                );

                                                return;
                                            }

                                            if (
                                                event.key === 'Enter' &&
                                                !event.shiftKey &&
                                                !event.metaKey &&
                                                !event.ctrlKey
                                            ) {
                                                event.preventDefault();
                                                pickMention(
                                                    mentionHits[
                                                        mentionHighlight
                                                    ]!,
                                                );

                                                return;
                                            }

                                            if (event.key === 'Escape') {
                                                event.preventDefault();
                                                setMentionOpen(false);
                                                setMentionStart(null);

                                                return;
                                            }
                                        }

                                        if (
                                            event.key === 'Enter' &&
                                            event.shiftKey
                                        ) {
                                            return;
                                        }

                                        if (
                                            event.key === ' ' &&
                                            event.shiftKey
                                        ) {
                                            event.preventDefault();
                                            insertAtCaret('\n');

                                            return;
                                        }

                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            send();
                                        }
                                    }}
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t(
                                        'collections.itemChat.mention',
                                    )}
                                    onClick={() => {
                                        const el = textareaRef.current;
                                        const start =
                                            el?.selectionStart ?? draft.length;
                                        const end =
                                            el?.selectionEnd ?? draft.length;
                                        const next =
                                            draft.slice(0, start) +
                                            '@' +
                                            draft.slice(end);
                                        onDraftChange(next, start + 1);
                                        window.setTimeout(() => {
                                            el?.focus();
                                            el?.setSelectionRange(
                                                start + 1,
                                                start + 1,
                                            );
                                        }, 0);
                                    }}
                                >
                                    @
                                </Button>
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
                                                        insertAtCaret(emoji);
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
                                    disabled={sending}
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
                                <Button
                                    type="button"
                                    className="ml-auto"
                                    disabled={
                                        sending || uploadingFiles.length > 0
                                    }
                                    aria-busy={sending}
                                    aria-label={
                                        sending
                                            ? t('collections.itemChat.sending')
                                            : t('collections.itemChat.send')
                                    }
                                    onClick={send}
                                    data-test="item-chat-send"
                                >
                                    {sending ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Send className="size-4" />
                                    )}
                                    {t('collections.itemChat.send')}
                                </Button>
                            </div>
                            {composerDragOver && !sending ? (
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
                    </DrawerFooter>
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
                    >
                        {threadShell}
                    </DrawerContent>
                </Drawer>
            )}

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
                            <select
                                id="item-chat-add-field"
                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
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
                            </select>
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

            <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('collections.itemChat.forwardTitle')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="item-chat-forward-item">
                            {t('collections.itemChat.forwardItemId')}
                        </Label>
                        <Input
                            id="item-chat-forward-item"
                            type="number"
                            min={1}
                            value={forwardItemId}
                            onChange={(event) =>
                                setForwardItemId(event.target.value)
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('collections.itemChat.forwardHint')}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setForwardOpen(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            disabled={forwarding || forwardItemId === ''}
                            onClick={confirmForward}
                        >
                            {t('collections.itemChat.forward')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function MessageActionsMenu({
    canEdit,
    canDelete,
    isPinned,
    disabled,
    onReply,
    onCopy,
    onPin,
    onForward,
    onSelect,
    onReact,
    onEdit,
    onDelete,
    children,
}: {
    canEdit: boolean;
    canDelete: boolean;
    isPinned: boolean;
    disabled: boolean;
    onReply: () => void;
    onCopy: () => void;
    onPin: () => void;
    onForward: () => void;
    onSelect: () => void;
    onReact: (emoji: string) => void;
    onEdit: () => void;
    onDelete: () => void;
    children: ReactElement;
}) {
    const { t } = useTranslation();

    if (disabled) {
        return children;
    }

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <div className="flex items-center gap-0.5 px-1 pb-1">
                    {REACTION_EMOJIS.map((emoji) => (
                        <button
                            key={emoji}
                            type="button"
                            className="flex size-7 items-center justify-center rounded-md text-base hover:bg-accent"
                            onClick={() => onReact(emoji)}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={onReply}>
                    <Reply />
                    {t('collections.itemChat.reply')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={onCopy}>
                    <Copy />
                    {t('collections.itemChat.copyText')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={onPin}>
                    <Pin />
                    {isPinned
                        ? t('collections.itemChat.unpin')
                        : t('collections.itemChat.pin')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={onForward}>
                    <Forward />
                    {t('collections.itemChat.forward')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={onSelect}>
                    <CheckSquare />
                    {t('collections.itemChat.select')}
                </ContextMenuItem>
                {canEdit ? (
                    <ContextMenuItem onSelect={onEdit}>
                        {t('collections.itemChat.edit')}
                    </ContextMenuItem>
                ) : null}
                {canDelete ? (
                    <ContextMenuItem variant="destructive" onSelect={onDelete}>
                        {t('common.delete')}
                    </ContextMenuItem>
                ) : null}
            </ContextMenuContent>
        </ContextMenu>
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
    const isImage = attachment.mime.startsWith('image/');

    return (
        <div className="flex w-full min-w-0 items-center gap-1">
            {isImage ? (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1"
                >
                    <img
                        src={href}
                        alt={attachment.name}
                        className="max-h-32 rounded-md border object-cover"
                    />
                </a>
            ) : (
                <a
                    href={href}
                    className="min-w-0 flex-1 truncate text-xs underline"
                    target="_blank"
                    rel="noreferrer"
                >
                    {attachment.name}
                </a>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-5 shrink-0 text-muted-foreground"
                        aria-label={t('collections.itemChat.more')}
                        onContextMenu={(event) => event.stopPropagation()}
                    >
                        <MoreVertical className="size-3" />
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
