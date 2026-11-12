import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessageActions } from '@/components/chat/chat-message-actions-menu';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
    deleteMessage,
    patchMessage,
    pinMessage,
    toggleReaction,
} from '@/lib/item-chat-api';
import type {
    ChatAttachment,
    ChatPinned,
    ChatScope,
    ItemChatMessage,
} from '@/lib/item-chat-api';
import {
    composeBodyForSubmit,
    storedBodyToDraft,
} from '@/lib/item-chat-mentions';
import { applyReactionToggle } from '@/lib/item-chat-reactions';
import { toast } from '@/lib/toast';
import { useChatStore } from '@/stores/chat/store';

type UseChatMessageActionsOptions = {
    open: boolean;
    scope: ChatScope | null;
    scopeKey: string | null;
    viewerId: number;
    viewerName: string;
    chatCount: number;
    liveChatIdRef: RefObject<string | null>;
    onChatCountChangeRef: RefObject<(count: number) => void>;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    setReplyTo: (message: ItemChatMessage | null) => void;
    setError: (error: string | null) => void;
    /** Reloads the latest page, to undo an optimistic reaction the server refused. */
    load: () => void;
};

/**
 * Per-message actions of the item chat: reply, copy, pin, react (optimistic, then the
 * server's reaction list), inline edit and delete behind a confirmation, plus keeping
 * an attachment in the store in step after "save to files".
 */
export function useChatMessageActions({
    open,
    scope,
    scopeKey,
    viewerId,
    viewerName,
    chatCount,
    liveChatIdRef,
    onChatCountChangeRef,
    textareaRef,
    setReplyTo,
    setError,
    load,
}: UseChatMessageActionsOptions) {
    const { t } = useTranslation();
    const replaceMessage = useChatStore((state) => state.replaceMessage);
    const removeCachedMessage = useChatStore((state) => state.removeMessage);
    const mapMessages = useChatStore((state) => state.mapMessages);
    const mapPinned = useChatStore((state) => state.mapPinned);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingDraft, setEditingDraft] = useState('');
    const [messagePendingDelete, setMessagePendingDelete] =
        useState<ItemChatMessage | null>(null);

    useEffect(() => {
        if (open) {
            // oxlint-disable-next-line react/set-state-in-effect -- moved as is from item-chat-drawer.tsx (#283), where the compiler skipped it; moving the reset out of the effect changes render timing (#671)
            setEditingId(null);
        }
    }, [open, scopeKey]);

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

    const copyMessageText = (message: ItemChatMessage): void => {
        const text = storedBodyToDraft(message.body, message.mentioned_users);
        void copyTextToClipboard(text).then((copied) => {
            if (!copied) {
                toast.error(t('collections.itemChat.copyFailed'));
            }
        });
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
        onDelete: () => setMessagePendingDelete(comment),
    });

    /** Swap in the attachment the server returned (for example after "save to files"). */
    const onAttachmentSaved = (
        commentId: number,
        next: ChatAttachment,
    ): void => {
        const id = liveChatIdRef.current;

        if (!id) {
            return;
        }

        mapMessages(id, (prev) =>
            prev.map((row) =>
                row.id === commentId
                    ? {
                          ...row,
                          attachments: row.attachments.map((item) =>
                              item.id === next.id ? next : item,
                          ),
                      }
                    : row,
            ),
        );
    };

    return {
        editingId,
        setEditingId,
        editingDraft,
        setEditingDraft,
        messagePendingDelete,
        setMessagePendingDelete,
        saveEdit,
        removeMessage,
        onReact,
        messageActionsFor,
        onAttachmentSaved,
    };
}
