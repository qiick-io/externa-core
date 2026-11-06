import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fileCardsFromToolResult,
    fileCardsFromToolResults,
} from '@/components/ai/ai-file-cards';
import type { AiFileCardItem } from '@/components/ai/ai-file-cards';
import {
    awaitingApprovalContent,
    getSpeechRecognitionConstructor,
    isAbortError,
    pickAiChatAttachmentFiles,
    stopSpeaking,
    streamAiChat,
    truncateAiConversationFrom,
    truncateLastUserMessageIfMatches,
    uploadAiAttachment,
} from '@/lib/ai-chat';
import type {
    AiApprovalDecision,
    AiChatAttachment,
    AiPendingApproval,
} from '@/lib/ai-chat';
import type { AiPendingContextAttachment } from '@/lib/ai-context';
import { contextIdsFromPending } from '@/lib/ai-context';
import { speechRecognitionLang } from '@/lib/format';
import i18n from '@/lib/i18n';
import { toast } from '@/lib/toast';

/** One line of an AI conversation, as streamed locally or loaded from the server. */
export type AiChatMessage = {
    id: string;
    role: string;
    content: string;
    isError?: boolean;
    attachments?: AiChatAttachment[];
    toolNames?: string[];
    fileCards?: AiFileCardItem[];
    tool_calls?: Array<{ name?: string; function?: { name?: string } }>;
    tool_results?: Array<{
        name?: string;
        tool_name?: string;
        result?: unknown;
    }>;
    pending_approvals?: AiPendingApproval[];
};

/** The user turn being streamed, kept so Stop can restore the composer. */
type InFlightTurn = {
    prompt: string;
    attachments: AiChatAttachment[];
    userMessageId: string;
    assistantMessageId: string;
};

type RunStreamOptions = {
    baseMessages: AiChatMessage[];
    attachments?: AiChatAttachment[];
    contextAttachments?: AiPendingContextAttachment[];
    approvals?: AiApprovalDecision[];
};

export type UseAiChatOptions = {
    /** Conversation the hook starts on (`null` for a new draft). */
    initialConversationId?: string | null;
    /** Messages the hook starts with. */
    initialMessages?: AiChatMessage[];
    /** Blocks send, regenerate and resend (AI backend unreachable). */
    isOffline?: boolean;
    /**
     * Called when a turn finished with an answer or a tool approval request,
     * with the conversation id the server assigned. The page reloads its props here.
     */
    onTurnSettled?: (conversationId: string | null) => void;
    /** Called for every streamed tool result (the page polls import jobs from it). */
    onToolResult?: (toolName: string, result: unknown) => void;
};

const DRY_RUN_PREFIX =
    '[SIMULATION MODE] Run dry_run=true only; do not write data.\n\n';

/**
 * Text for an assistant turn that only ran tools and streamed no answer.
 *
 * @param toolsUsed - Tool names reported while streaming
 * @param toolCalls - Tool calls stored on a loaded message
 * @returns A short "Completed via …" sentence
 */
export function toolFallbackContent(
    toolsUsed: string[] = [],
    toolCalls?: AiChatMessage['tool_calls'],
): string {
    const namesFromCalls =
        toolCalls
            ?.map((toolCall) => toolCall.name ?? toolCall.function?.name)
            .filter(
                (name): name is string =>
                    typeof name === 'string' && name !== '',
            ) ?? [];
    const uniqueTools = [...new Set([...toolsUsed, ...namesFromCalls])];

    return i18n.t('ai.toolFallback', {
        tools:
            uniqueTools.length > 0
                ? uniqueTools.join(', ')
                : i18n.t('ai.aTool'),
    });
}

/**
 * Prepares server messages for display: file cards from tool results, a fallback
 * text for tool-only turns, and no permanently blank assistant bubble.
 *
 * @param messages - Messages as the server returns them
 * @returns Messages ready for `AiChatMessages`
 */
export function settleLoadedAiMessages(
    messages: AiChatMessage[],
): AiChatMessage[] {
    return messages.flatMap((message) => {
        const fileCards = fileCardsFromToolResults(message.tool_results);
        const withCards =
            fileCards.length > 0 ? { ...message, fileCards } : message;

        if (
            withCards.role !== 'assistant' ||
            withCards.content.trim() !== '' ||
            withCards.isError
        ) {
            return [withCards];
        }

        if ((withCards.tool_calls?.length ?? 0) > 0) {
            return [
                {
                    ...withCards,
                    content: toolFallbackContent([], withCards.tool_calls),
                },
            ];
        }

        return [];
    });
}

/**
 * @param messageId - Message id
 * @returns Whether the server stored the message (local ids start with `local-`)
 */
export function isPersistedAiMessageId(messageId: string): boolean {
    return !messageId.startsWith('local-');
}

/** Secure-context-safe id — crypto.randomUUID is unavailable on http://*.test */
function createLocalMessageId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The AI chat controller shared by the Assistant page and the Assistant panel:
 * composer draft, streaming over Externa's SSE (`streamAiChat`), Stop with
 * composer restore, regenerate, edit and resend, tool approvals, uploaded and
 * context attachments, dry-run and voice dictation. It renders nothing.
 *
 * Side effects: network calls through `lib/ai-chat`, toasts on errors, and
 * aborting the stream, the dictation and speech on unmount.
 *
 * @param options - Starting conversation and surface-specific callbacks
 * @returns Chat state and the handlers the composer and message list call
 */
export function useAiChat(options: UseAiChatOptions = {}) {
    const { t, i18n } = useTranslation();
    const { isOffline = false } = options;

    const [composer, setComposer] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    /** Tool the model is running right now, for the status line. */
    const [runningToolName, setRunningToolName] = useState<string | null>(null);
    const [messages, setMessages] = useState<AiChatMessage[]>(
        options.initialMessages ?? [],
    );
    const [conversationId, setConversationId] = useState<string | null>(
        options.initialConversationId ?? null,
    );
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [editingDraft, setEditingDraft] = useState('');
    const [pendingAttachments, setPendingAttachments] = useState<
        AiChatAttachment[]
    >([]);
    const [pendingContextAttachments, setPendingContextAttachments] = useState<
        AiPendingContextAttachment[]
    >([]);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [dryRunMode, setDryRunMode] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [speechSupported] = useState(
        () => getSpeechRecognitionConstructor() !== null,
    );

    const conversationIdRef = useRef<string | null>(
        options.initialConversationId ?? null,
    );
    const isStreamingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightTurnRef = useRef<InFlightTurn | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const callbacksRef = useRef(options);
    callbacksRef.current = options;

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
            recognitionRef.current?.abort();
            stopSpeaking();
        };
    }, []);

    const markStreamingFinished = (): void => {
        isStreamingRef.current = false;
        setIsStreaming(false);
        setRunningToolName(null);
    };

    const updateMessage = (
        messageId: string,
        update: (message: AiChatMessage) => AiChatMessage,
    ): void => {
        setMessages((current) =>
            current.map((entry) =>
                entry.id === messageId ? update(entry) : entry,
            ),
        );
    };

    const markAssistantError = (messageId: string, text: string): void => {
        updateMessage(messageId, (entry) => ({
            ...entry,
            content: text,
            isError: true,
        }));
    };

    /** Aborts the stream without rolling back (used before navigating away). */
    const abortStream = useCallback((): void => {
        if (!isStreamingRef.current) {
            return;
        }

        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
    }, []);

    /**
     * Replaces the conversation with server messages; ignored while streaming so
     * a props reload cannot wipe the turn being written.
     */
    const loadConversation = useCallback(
        (
            loadedMessages: AiChatMessage[],
            loadedConversationId: string | null,
        ) => {
            if (isStreamingRef.current) {
                return;
            }

            setMessages(settleLoadedAiMessages(loadedMessages));
            setConversationId(loadedConversationId);
            conversationIdRef.current = loadedConversationId;
            setEditingMessageId(null);
            setEditingDraft('');
        },
        [],
    );

    /** Drops the current thread and seeds a fresh draft with `prompt`. */
    const startNewDraft = useCallback((prompt: string): void => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        inFlightTurnRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
        setRunningToolName(null);
        setConversationId(null);
        conversationIdRef.current = null;
        setMessages([]);
        setPendingAttachments([]);
        setEditingMessageId(null);
        setEditingDraft('');
        setComposer(prompt);
    }, []);

    const handleStop = (): void => {
        const inFlightTurn = inFlightTurnRef.current;
        const abortController = abortControllerRef.current;

        // Mark streaming finished before abort so late onDone/onToken see the flag.
        markStreamingFinished();

        abortController?.abort();
        abortControllerRef.current = null;

        if (!inFlightTurn) {
            // Drop the empty in-flight assistant bubble so Stop never leaves a blank card.
            setMessages((current) =>
                current.filter(
                    (entry) =>
                        !(
                            entry.role === 'assistant' &&
                            entry.content.trim() === '' &&
                            !entry.isError
                        ),
                ),
            );

            return;
        }

        inFlightTurnRef.current = null;
        setComposer(inFlightTurn.prompt);
        setPendingAttachments(inFlightTurn.attachments);
        setMessages((current) =>
            current.filter(
                (entry) =>
                    entry.id !== inFlightTurn.userMessageId &&
                    entry.id !== inFlightTurn.assistantMessageId,
            ),
        );

        const conversationIdToTruncate = conversationIdRef.current;

        if (conversationIdToTruncate) {
            // Best-effort: remove the persisted user turn if the server already saved it.
            void truncateLastUserMessageIfMatches(
                conversationIdToTruncate,
                inFlightTurn.prompt,
            );
        }
    };

    const runStream = async (
        message: string,
        streamOptions: RunStreamOptions,
    ): Promise<boolean> => {
        const attachmentsForMessage = streamOptions.attachments ?? [];
        const contextIds = contextIdsFromPending(
            streamOptions.contextAttachments ?? [],
        );
        const approvalDecisions = streamOptions.approvals ?? [];
        const isResume = approvalDecisions.length > 0;
        const userMessageId = createLocalMessageId('local-user');
        const assistantMessageId = createLocalMessageId('local-assistant');
        let approvalsRequested: AiPendingApproval[] = [];
        let completed = false;
        const toolsUsed: string[] = [];

        // A resume has no user turn of its own, so Stop only drops the empty assistant bubble.
        inFlightTurnRef.current = isResume
            ? null
            : {
                  prompt: message,
                  attachments: attachmentsForMessage,
                  userMessageId,
                  assistantMessageId,
              };

        setMessages([
            ...streamOptions.baseMessages,
            ...(isResume
                ? []
                : [
                      {
                          id: userMessageId,
                          role: 'user',
                          content: message,
                          attachments: attachmentsForMessage,
                      },
                  ]),
            { id: assistantMessageId, role: 'assistant', content: '' },
        ]);
        isStreamingRef.current = true;
        setIsStreaming(true);
        setRunningToolName(null);
        stopSpeaking();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const settleTurn = (): void => {
            completed = true;
            inFlightTurnRef.current = null;
            abortControllerRef.current = null;
            markStreamingFinished();
        };

        try {
            await streamAiChat(
                message,
                conversationIdRef.current,
                {
                    signal: abortController.signal,
                    onToken: (token) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        updateMessage(assistantMessageId, (entry) => ({
                            ...entry,
                            content: entry.content + token,
                            isError: false,
                        }));
                    },
                    onTool: (toolName) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        toolsUsed.push(toolName);
                        setRunningToolName(toolName);
                    },
                    onToolResult: (toolName, result) => {
                        callbacksRef.current.onToolResult?.(toolName, result);

                        const cards = fileCardsFromToolResult(toolName, result);

                        if (cards.length === 0) {
                            return;
                        }

                        updateMessage(assistantMessageId, (entry) => {
                            const cardsById = new Map(
                                (entry.fileCards ?? []).map((file) => [
                                    file.id,
                                    file,
                                ]),
                            );

                            for (const file of cards) {
                                cardsById.set(file.id, file);
                            }

                            return {
                                ...entry,
                                fileCards: [...cardsById.values()],
                            };
                        });
                    },
                    onApprovalRequest: (approvals) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        approvalsRequested = [
                            ...approvalsRequested,
                            ...approvals,
                        ];
                        const requested = approvalsRequested;
                        updateMessage(assistantMessageId, (entry) => ({
                            ...entry,
                            pending_approvals: requested,
                        }));
                    },
                    onConversationId: (id) => {
                        // Keep the conversation id even after Stop so truncate cleanup can run.
                        conversationIdRef.current = id;
                        setConversationId(id);
                    },
                    onDone: (fullText) => {
                        // Stop already rolled back the UI; never reload after abort.
                        if (abortController.signal.aborted) {
                            return;
                        }

                        settleTurn();

                        const trimmed = fullText.trim();
                        const toolNames = [...new Set(toolsUsed)];

                        if (approvalsRequested.length > 0) {
                            const requested = approvalsRequested;
                            updateMessage(assistantMessageId, (entry) => ({
                                ...entry,
                                content:
                                    trimmed !== ''
                                        ? fullText
                                        : awaitingApprovalContent(requested),
                                isError: false,
                                pending_approvals: requested,
                            }));
                            callbacksRef.current.onTurnSettled?.(
                                conversationIdRef.current,
                            );

                            return;
                        }

                        if (trimmed === '') {
                            // Tool-only turns often end with no final text from local models.
                            if (toolsUsed.length > 0) {
                                updateMessage(assistantMessageId, (entry) => ({
                                    ...entry,
                                    content: toolFallbackContent(toolsUsed),
                                    isError: false,
                                    toolNames,
                                }));
                                // The reload swaps in the server summary, if any.
                                callbacksRef.current.onTurnSettled?.(
                                    conversationIdRef.current,
                                );

                                return;
                            }

                            markAssistantError(
                                assistantMessageId,
                                t('ai.responseTryAgain'),
                            );
                            toast.error(t('ai.noResponse'));

                            return;
                        }

                        updateMessage(assistantMessageId, (entry) => ({
                            ...entry,
                            content: fullText,
                            isError: false,
                            toolNames,
                        }));
                        callbacksRef.current.onTurnSettled?.(
                            conversationIdRef.current,
                        );
                    },
                    onError: (error) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        inFlightTurnRef.current = null;
                        abortControllerRef.current = null;
                        markStreamingFinished();
                        markAssistantError(
                            assistantMessageId,
                            error.message || t('ai.responseError'),
                        );
                    },
                },
                attachmentsForMessage.map((attachment) => attachment.id),
                approvalDecisions,
                {
                    itemIds: contextIds.contextItemIds,
                    fileIds: contextIds.contextFileIds,
                    promptIds: contextIds.contextPromptIds,
                },
            );

            // Stop: streamAiChat swallows AbortError; handleStop already rolled back the UI.
            if (abortController.signal.aborted) {
                return false;
            }

            // The stream ended without onDone (truncated body or stream error event).
            if (!completed) {
                inFlightTurnRef.current = null;
                abortControllerRef.current = null;
                setMessages((current) =>
                    current.map((entry) => {
                        if (
                            entry.id !== assistantMessageId ||
                            entry.content.trim() !== '' ||
                            entry.isError
                        ) {
                            return entry;
                        }

                        return toolsUsed.length > 0
                            ? {
                                  ...entry,
                                  content: toolFallbackContent(toolsUsed),
                                  isError: false,
                              }
                            : {
                                  ...entry,
                                  content: t('ai.responseTryAgain'),
                                  isError: true,
                              };
                    }),
                );
                markStreamingFinished();
            }

            return completed;
        } catch (error) {
            abortControllerRef.current = null;
            markStreamingFinished();

            if (isAbortError(error) || abortController.signal.aborted) {
                // handleStop owns rollback and composer restore; no error toast.
                return false;
            }

            inFlightTurnRef.current = null;

            const messageText =
                error instanceof Error ? error.message : t('ai.responseError');

            markAssistantError(assistantMessageId, messageText);
            toast.error(messageText);

            return false;
        }
    };

    const handleSend = async (): Promise<void> => {
        const message = composer.trim();

        if (
            (!message &&
                pendingAttachments.length === 0 &&
                pendingContextAttachments.length === 0) ||
            isStreamingRef.current ||
            isOffline ||
            isUploadingAttachment
        ) {
            return;
        }

        if (!message) {
            toast.error(t('ai.writeMessageWithAttachments'));

            return;
        }

        const attachmentsToSend = pendingAttachments;
        const contextToSend = pendingContextAttachments;
        setComposer('');
        setPendingAttachments([]);
        setPendingContextAttachments([]);

        await runStream(dryRunMode ? `${DRY_RUN_PREFIX}${message}` : message, {
            baseMessages: messages,
            attachments: attachmentsToSend,
            contextAttachments: contextToSend,
        });
    };

    const handleResolveApprovals = async (
        messageId: string,
        approved: boolean,
    ): Promise<void> => {
        const pending =
            messages.find((entry) => entry.id === messageId)
                ?.pending_approvals ?? [];

        if (isStreamingRef.current || pending.length === 0) {
            return;
        }

        await runStream('', {
            baseMessages: messages.map((entry) =>
                entry.id === messageId
                    ? { ...entry, pending_approvals: [] }
                    : entry,
            ),
            approvals: pending.map((approval) => ({
                id: approval.id,
                approved,
            })),
        });
    };

    /**
     * Removes the server copy of a turn (and everything after it) before it is
     * sent again. Local turns are not stored yet, so there is nothing to remove.
     *
     * @returns Whether the resend may go ahead
     */
    const truncateServerFrom = async (
        messageId: string,
        errorKey: string,
    ): Promise<boolean> => {
        const currentConversationId = conversationIdRef.current;

        if (!currentConversationId || !isPersistedAiMessageId(messageId)) {
            return true;
        }

        try {
            await truncateAiConversationFrom(currentConversationId, messageId);

            return true;
        } catch {
            toast.error(t(errorKey));

            return false;
        }
    };

    /**
     * Uploaded attachments travel again with a resent local turn; a stored turn
     * keeps the attachments the server already bound to it.
     */
    const attachmentsToResend = (message: AiChatMessage): AiChatAttachment[] =>
        isPersistedAiMessageId(message.id) ? [] : (message.attachments ?? []);

    const handleRegenerate = async (
        assistantMessageId: string,
        regenerateOptions: { asRetry?: boolean } = {},
    ): Promise<void> => {
        if (isStreamingRef.current || isOffline) {
            return;
        }

        const assistantIndex = messages.findIndex(
            (entry) => entry.id === assistantMessageId,
        );
        const userIndex = messages.findLastIndex(
            (entry, index) => index < assistantIndex && entry.role === 'user',
        );
        const userMessage = userIndex >= 0 ? messages[userIndex] : undefined;

        if (!userMessage) {
            toast.error(t('ai.noUserMessageToRegenerate'));

            return;
        }

        const prompt = userMessage.content.trim();

        if (!prompt) {
            return;
        }

        if (
            !(await truncateServerFrom(
                userMessage.id,
                'ai.unablePrepareRegeneration',
            ))
        ) {
            return;
        }

        const succeeded = await runStream(prompt, {
            baseMessages: messages.slice(0, userIndex),
            attachments: attachmentsToResend(userMessage),
        });

        if (succeeded && regenerateOptions.asRetry) {
            toast.success(t('ai.messageResent'));
        }
    };

    const startEditing = (message: AiChatMessage): void => {
        if (isStreamingRef.current) {
            handleStop();
        }

        setEditingMessageId(message.id);
        setEditingDraft(message.content);
    };

    const cancelEditing = (): void => {
        setEditingMessageId(null);
        setEditingDraft('');
    };

    const handleResendEdited = async (messageId: string): Promise<void> => {
        const draft = editingDraft.trim();

        if (!draft) {
            toast.error(t('ai.messageCannotBeEmpty'));

            return;
        }

        if (isOffline) {
            return;
        }

        if (isStreamingRef.current) {
            handleStop();
        }

        const messageIndex = messages.findIndex(
            (entry) => entry.id === messageId,
        );
        const editedMessage = messages[messageIndex];

        if (!editedMessage) {
            return;
        }

        if (!(await truncateServerFrom(messageId, 'ai.unableEditMessage'))) {
            return;
        }

        setEditingMessageId(null);
        setEditingDraft('');

        await runStream(draft, {
            baseMessages: messages.slice(0, messageIndex),
            attachments: attachmentsToResend(editedMessage),
        });
    };

    const handleAttachmentFiles = async (
        files: FileList | File[],
    ): Promise<void> => {
        const { files: filesToUpload, error } = pickAiChatAttachmentFiles(
            files,
            pendingAttachments.length,
        );

        if (error) {
            toast.error(error);
        }

        if (filesToUpload.length === 0) {
            return;
        }

        setIsUploadingAttachment(true);

        try {
            for (const file of filesToUpload) {
                const attachment = await uploadAiAttachment(file);
                setPendingAttachments((current) => [...current, attachment]);
            }
        } catch (uploadError) {
            toast.error(
                uploadError instanceof Error
                    ? uploadError.message
                    : t('ai.attachmentUploadFailed'),
            );
        } finally {
            setIsUploadingAttachment(false);
        }
    };

    const handleAttachmentSelected = async (
        event: ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const selectedFiles = event.target.files;
        event.target.value = '';

        if (!selectedFiles || selectedFiles.length === 0) {
            return;
        }

        await handleAttachmentFiles(selectedFiles);
    };

    const removePendingAttachment = (attachmentId: string): void => {
        setPendingAttachments((current) =>
            current.filter((attachment) => attachment.id !== attachmentId),
        );
    };

    /** Adds context entries from the attach dialog, skipping ones already attached. */
    const addContextAttachments = (
        entries: AiPendingContextAttachment[],
    ): void => {
        setPendingContextAttachments((current) => {
            const next = [...current];

            for (const entry of entries) {
                if (
                    !next.some(
                        (row) => row.kind === entry.kind && row.id === entry.id,
                    )
                ) {
                    next.push(entry);
                }
            }

            return next;
        });
    };

    const removePendingContextAttachment = (
        kind: AiPendingContextAttachment['kind'],
        id: number,
    ): void => {
        setPendingContextAttachments((current) =>
            current.filter(
                (attachment) =>
                    !(attachment.kind === kind && attachment.id === id),
            ),
        );
    };

    const toggleVoiceInput = (): void => {
        const Recognition = getSpeechRecognitionConstructor();

        if (!Recognition) {
            toast.error(t('ai.dictationUnsupported'));

            return;
        }

        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);

            return;
        }

        const recognition = new Recognition();
        recognition.lang = speechRecognitionLang(i18n.language);
        recognition.continuous = false;
        recognition.interimResults = false;
        recognitionRef.current = recognition;

        recognition.addEventListener('result', (event) => {
            let transcript = '';

            for (
                let index = event.resultIndex;
                index < event.results.length;
                index++
            ) {
                const result = event.results[index];

                if (result?.isFinal) {
                    transcript += result[0]?.transcript ?? '';
                }
            }

            if (transcript.trim() !== '') {
                setComposer((current) => {
                    const prefix =
                        current.trim() === '' ? '' : `${current.trim()} `;

                    return `${prefix}${transcript.trim()}`;
                });
            }
        });

        recognition.addEventListener('error', () => {
            setIsListening(false);
            recognitionRef.current = null;
            toast.error(t('ai.dictationError'));
        });

        recognition.addEventListener('end', () => {
            setIsListening(false);
            recognitionRef.current = null;
        });

        try {
            recognition.start();
            setIsListening(true);
        } catch {
            setIsListening(false);
            toast.error(t('ai.unableStartDictation'));
        }
    };

    return {
        composer,
        setComposer,
        messages,
        conversationId,
        isStreaming,
        runningToolName,
        editingMessageId,
        editingDraft,
        setEditingDraft,
        pendingAttachments,
        pendingContextAttachments,
        isUploadingAttachment,
        dryRunMode,
        setDryRunMode,
        isListening,
        speechSupported,
        loadConversation,
        startNewDraft,
        abortStream,
        handleSend,
        handleStop,
        handleRegenerate,
        handleResolveApprovals,
        startEditing,
        cancelEditing,
        handleResendEdited,
        handleAttachmentFiles,
        handleAttachmentSelected,
        removePendingAttachment,
        addContextAttachments,
        removePendingContextAttachment,
        toggleVoiceInput,
    };
}
