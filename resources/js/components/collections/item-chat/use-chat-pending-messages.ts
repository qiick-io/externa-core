import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingChatMessage } from '@/components/chat/chat-outgoing-attach-preview';
import {
    deleteChatAttachment,
    postMessage,
    uploadChatAttachment,
} from '@/lib/item-chat-api';
import type { ChatScope, ItemChatMessage } from '@/lib/item-chat-api';
import { pendingMatchesEchoMessage } from '@/lib/pending-chat-match';
import { useChatStore } from '@/stores/chat/store';

type UseChatPendingMessagesOptions = {
    open: boolean;
    scope: ChatScope | null;
    scopeKey: string | null;
    realtimeOn: boolean;
    chatMaxUploadBytes: number | null;
    /** Reloads the latest page when no Echo event will deliver the sent message. */
    load: () => void;
    liveChatIdRef: RefObject<string | null>;
    chatCountRef: RefObject<number>;
    onChatCountChangeRef: RefObject<(count: number) => void>;
    /** Set when an own message lands, so the feed jumps to the latest message. */
    forceScrollBottomRef: RefObject<boolean>;
};

/**
 * Optimistic outgoing messages: each send becomes a pending bubble that uploads its
 * files, posts the message, and is replaced by the stored message on success (or by
 * the own Echo echo, whichever comes first). Failed rows stay with a retry action.
 *
 * `pendingMessagesRef` is written before every state update so the pipeline never
 * races React's batching.
 */
export function useChatPendingMessages({
    open,
    scope,
    scopeKey,
    realtimeOn,
    chatMaxUploadBytes,
    load,
    liveChatIdRef,
    chatCountRef,
    onChatCountChangeRef,
    forceScrollBottomRef,
}: UseChatPendingMessagesOptions) {
    const { t } = useTranslation();
    const appendMessage = useChatStore((state) => state.appendMessage);
    const patchThread = useChatStore((state) => state.patchThread);
    const [pendingMessages, setPendingMessages] = useState<
        PendingChatMessage[]
    >([]);
    const pendingMessagesRef = useRef(pendingMessages);
    const pendingAbortRef = useRef<Map<string, AbortController>>(new Map());

    useEffect(() => {
        pendingMessagesRef.current = pendingMessages;
    }, [pendingMessages]);

    useEffect(() => {
        if (!open) {
            // oxlint-disable-next-line react/set-state-in-effect -- moved as is from item-chat-drawer.tsx (#283), where the compiler skipped it; moving the reset out of the effect changes render timing (#671)
            setPendingMessages([]);
        }
    }, [open, scopeKey]);

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

    /**
     * Drop the one pending row an own Echo `MessageCreated` stands for. Wiping all
     * non-failed rows would abort in-flight uploads and sends that never POSTed.
     */
    const dropEchoedPending = useCallback((next: ItemChatMessage): void => {
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
    }, []);

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
        [
            appendMessage,
            load,
            patchThread,
            realtimeOn,
            liveChatIdRef,
            forceScrollBottomRef,
            onChatCountChangeRef,
            chatCountRef,
        ],
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

                // applySnapshot replaces the array (never mutates it), so this iterates the files as they were.
                for (const file of snapshot.files) {
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

    /** Add a new pending row and start its upload / send pipeline. */
    const enqueuePending = (pending: PendingChatMessage): void => {
        forceScrollBottomRef.current = true;
        // Ref first so pipeline never races setState.
        pendingMessagesRef.current = [...pendingMessagesRef.current, pending];
        setPendingMessages(pendingMessagesRef.current);
        void runPendingPipeline(pending.clientId);
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

    return {
        pendingMessages,
        enqueuePending,
        dropEchoedPending,
        retryPending,
        removePendingFile,
    };
}
