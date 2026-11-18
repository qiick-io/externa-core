import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import type { PendingChatMessage } from '@/components/chat/chat-outgoing-attach-preview';
import type { SendAttachItem } from '@/components/chat/chat-send-attachments-dialog';
import type { MentionHit } from '@/components/collections/item-chat/item-chat-format';
import { fetchMentions, uploadChatAttachment } from '@/lib/item-chat-api';
import type {
    ChatCollection,
    ChatScope,
    ChatUser,
    ItemChatMessage,
} from '@/lib/item-chat-api';
import {
    collectionMentionLabel,
    composeBodyForSubmit,
    mentionDisplayLabel,
    mentionQueryAt,
} from '@/lib/item-chat-mentions';

/** State and handlers `ChatMentionMenu` and its keyboard helper need. */
export type ChatMentionMenuState = {
    isOpen: boolean;
    hits: MentionHit[];
    highlightIndex: number;
    onHighlightChange: (index: number) => void;
    onPick: (hit: MentionHit) => void;
    onDismiss: () => void;
};

type UseChatComposerOptions = {
    open: boolean;
    scope: ChatScope | null;
    scopeKey: string | null;
    mentionsEnabled: boolean;
    chatMaxUploadBytes: number | null;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    captionTextareaRef: RefObject<HTMLTextAreaElement | null>;
    whisperTyping: () => void;
    enqueuePending: (pending: PendingChatMessage) => void;
    setError: (error: string | null) => void;
};

function revokeAttachPreviews(items: SendAttachItem[]): void {
    for (const item of items) {
        if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    }
}

/**
 * Composer of one chat thread: the draft, the reply target, `@` mentions (users and
 * collections), the emoji picker, and the attachment batch with its caption dialog,
 * file picker and drag-and-drop. Sending turns the draft or the batch into a pending
 * message (see `useChatPendingMessages`).
 *
 * While the attachment dialog is open, typing, mentions and emoji go to its caption
 * instead of the main textarea.
 */
export function useChatComposer({
    open,
    scope,
    scopeKey,
    mentionsEnabled,
    chatMaxUploadBytes,
    textareaRef,
    captionTextareaRef,
    whisperTyping,
    enqueuePending,
    setError,
}: UseChatComposerOptions) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const [attachDialogOpen, setAttachDialogOpen] = useState(false);
    const [attachItems, setAttachItems] = useState<SendAttachItem[]>([]);
    const [attachCaption, setAttachCaption] = useState('');
    const [composerDragOver, setComposerDragOver] = useState(false);
    const [mentionedUsers, setMentionedUsers] = useState<ChatUser[]>([]);
    const [mentionedCollections, setMentionedCollections] = useState<
        ChatCollection[]
    >([]);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionHits, setMentionHits] = useState<MentionHit[]>([]);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [replyTo, setReplyTo] = useState<ItemChatMessage | null>(null);
    const uploadGen = useRef(0);

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

    useEffect(() => {
        if (!replyTo) {
            return;
        }

        const handle = window.setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);

        return () => window.clearTimeout(handle);
    }, [replyTo, textareaRef]);

    useEffect(() => {
        if (!open) {
            // oxlint-disable-next-line react/set-state-in-effect -- clearAttachBatch also bumps the upload generation ref and revokes preview object URLs; those side effects must not run during render (#726)
            clearAttachBatch();
            setComposerDragOver(false);

            return;
        }

        setDraft('');
        clearAttachBatch();
        setMentionedUsers([]);
        setReplyTo(null);
    }, [open, scopeKey, clearAttachBatch]);

    const [highlightedHits, setHighlightedHits] = useState(mentionHits);
    const [wereMentionsEnabled, setWereMentionsEnabled] =
        useState(mentionsEnabled);

    // New suggestions start on the first one, during render (React's "adjust state
    // on prop change" pattern).
    if (highlightedHits !== mentionHits) {
        setHighlightedHits(mentionHits);
        setMentionHighlight(0);
    }

    // Turning mentions off closes the picker and forgets the picked mentions.
    if (wereMentionsEnabled !== mentionsEnabled) {
        setWereMentionsEnabled(mentionsEnabled);

        if (!mentionsEnabled) {
            setMentionOpen(false);
            setMentionStart(null);
            setMentionHits([]);
            setMentionedUsers([]);
            setMentionedCollections([]);
        }
    }

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
                const hits: MentionHit[] = [
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

    const pickMention = (hit: MentionHit): void => {
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

    const dismissMention = (): void => {
        setMentionOpen(false);
        setMentionStart(null);
    };

    const mentionMenu: ChatMentionMenuState = {
        isOpen: mentionsEnabled && mentionOpen && !attachDialogOpen,
        hits: mentionHits,
        highlightIndex: mentionHighlight,
        onHighlightChange: setMentionHighlight,
        onPick: pickMention,
        onDismiss: dismissMention,
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
        enqueuePending(pending);
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
        enqueuePending(pending);
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

    /**
     * Stage picked or dropped files in the attachment dialog and start uploading them
     * right away; the batch is sent from the dialog.
     */
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

    return {
        draft,
        replyTo,
        setReplyTo,
        attachDialogOpen,
        attachItems,
        attachCaption,
        composerDragOver,
        emojiOpen,
        setEmojiOpen,
        mentionOpen,
        mentionHits,
        mentionHighlight,
        setMentionHighlight,
        mentionMenu,
        pickMention,
        dismissMention,
        insertAtCaret,
        insertMentionTrigger,
        onComposerChange,
        send,
        sendAttachBatch,
        removeAttachItem,
        closeAttachDialog,
        onPickFiles,
        onComposerDragEnter,
        onComposerDragOver,
        onComposerDragLeave,
        onComposerDrop,
    };
}
