import { Link, usePage } from '@inertiajs/react';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AiActionPresetsDrawer } from '@/components/ai/ai-action-presets-drawer';
import { AiChatDropZone } from '@/components/ai/ai-chat-drop-zone';
import { AiChatMessages } from '@/components/ai/ai-chat-messages';
import type { AiChatMessageView } from '@/components/ai/ai-chat-messages';
import { AiComposer } from '@/components/ai/ai-composer';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import {
    AI_CHAT_ATTACHMENT_ACCEPT,
    AI_CHAT_ATTACHMENT_MAX_COUNT,
    fetchAiStatus,
    getSpeechRecognitionConstructor,
    isAbortError,
    pickAiChatAttachmentFiles,
    stopSpeaking,
    streamAiChat,
    truncateLastUserMessageIfMatches,
    uploadAiAttachment,
} from '@/lib/ai-chat';
import type { AiChatAttachment, AiStatus } from '@/lib/ai-chat';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { index as aiIndex } from '@/routes/ai';

type ChatLine = AiChatMessageView & {
    role: 'user' | 'assistant';
};

type InFlightTurn = {
    prompt: string;
    attachments: AiChatAttachment[];
    userMessageId: string;
    assistantMessageId: string;
};

/**
 * Floating action button that opens the AI assistant chat.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function AiFab() {
    const { t } = useTranslation();
    const { can } = useCan();
    const page = usePage();
    const canUseAi = can(PermissionEnum.CanUseAi);
    const isAiRoute =
        page.url === '/ai' || page.url.startsWith('/ai/') || page.url.startsWith('/ai?');

    const [open, setOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [status, setStatus] = useState<AiStatus>({ online: false });
    const [composer, setComposer] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [toolHint, setToolHint] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatLine[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<
        AiChatAttachment[]
    >([]);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [speechSupported] = useState(
        () => getSpeechRecognitionConstructor() !== null,
    );
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [editingDraft, setEditingDraft] = useState('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const conversationIdRef = useRef<string | null>(null);
    const inFlightTurnRef = useRef<InFlightTurn | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        conversationIdRef.current = conversationId;
    }, [conversationId]);

    useEffect(() => {
        if (!canUseAi) {
            return;
        }

        let cancelled = false;

        const refresh = async () => {
            const next = await fetchAiStatus();

            if (!cancelled) {
                setStatus(next);
            }
        };

        void refresh();

        const onFocus = () => {
            void refresh();
        };

        window.addEventListener('focus', onFocus);
        const intervalId = window.setInterval(() => {
            void refresh();
        }, 15000);

        return () => {
            cancelled = true;
            abortControllerRef.current?.abort();
            recognitionRef.current?.abort();
            stopSpeaking();
            window.removeEventListener('focus', onFocus);
            window.clearInterval(intervalId);
        };
    }, [canUseAi]);

    if (!canUseAi || isAiRoute) {
        return null;
    }

    const offline = !status.online;

    const handleStop = () => {
        const inFlightTurn = inFlightTurnRef.current;
        const abortController = abortControllerRef.current;

        setIsStreaming(false);
        setToolHint(null);

        abortController?.abort();
        abortControllerRef.current = null;

        if (!inFlightTurn) {
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
            void truncateLastUserMessageIfMatches(
                conversationIdToTruncate,
                inFlightTurn.prompt,
            );
        }
    };

    const findPrecedingUserMessage = (
        assistantMessageId: string,
    ): ChatLine | null => {
        const assistantIndex = messages.findIndex(
            (entry) => entry.id === assistantMessageId,
        );

        if (assistantIndex <= 0) {
            return null;
        }

        for (let index = assistantIndex - 1; index >= 0; index--) {
            if (messages[index]?.role === 'user') {
                return messages[index] ?? null;
            }
        }

        return null;
    };

    const runStream = async (
        message: string,
        baseMessages: ChatLine[],
        attachments: AiChatAttachment[] = [],
    ): Promise<boolean> => {
        const userMessageId = `user-${Date.now()}`;
        const assistantId = `assistant-${Date.now()}`;
        let completed = false;

        inFlightTurnRef.current = {
            prompt: message,
            attachments,
            userMessageId,
            assistantMessageId: assistantId,
        };

        setMessages([
            ...baseMessages,
            {
                id: userMessageId,
                role: 'user',
                content: message,
                attachments,
            },
            { id: assistantId, role: 'assistant', content: '' },
        ]);
        setIsStreaming(true);
        setToolHint(null);
        stopSpeaking();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

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

                        setMessages((current) =>
                            current.map((entry) =>
                                entry.id === assistantId
                                    ? {
                                          ...entry,
                                          content: entry.content + token,
                                          isError: false,
                                      }
                                    : entry,
                            ),
                        );
                    },
                    onTool: (toolName) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        setToolHint(`Chiamata ${toolName}…`);
                    },
                    onConversationId: (id) => {
                        conversationIdRef.current = id;
                        setConversationId(id);
                    },
                    onDone: () => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        completed = true;
                        inFlightTurnRef.current = null;
                        abortControllerRef.current = null;
                        setIsStreaming(false);
                        setToolHint(null);
                    },
                    onError: () => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        inFlightTurnRef.current = null;
                        abortControllerRef.current = null;
                        setIsStreaming(false);
                        setToolHint(null);
                    },
                },
                attachments.map((attachment) => attachment.id),
            );

            if (abortController.signal.aborted) {
                return false;
            }

            return completed;
        } catch (error) {
            abortControllerRef.current = null;
            setIsStreaming(false);
            setToolHint(null);

            if (isAbortError(error) || abortController.signal.aborted) {
                // handleStop owns rollback + composer restore; avoid error toasts.
                return false;
            }

            inFlightTurnRef.current = null;

            const messageText =
                error instanceof Error
                    ? error.message
                    : 'Error during response';

            setMessages((current) =>
                current.map((entry) =>
                    entry.id === assistantId
                        ? { ...entry, content: messageText, isError: true }
                        : entry,
                ),
            );
            toast.error(messageText);

            return false;
        }
    };

    const handleAttachmentFiles = async (files: FileList | File[]) => {
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
                    : 'Attachment upload failed',
            );
        } finally {
            setIsUploadingAttachment(false);
        }
    };

    const handleAttachmentSelected = async (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFiles = event.target.files;
        event.target.value = '';

        if (!selectedFiles || selectedFiles.length === 0) {
            return;
        }

        await handleAttachmentFiles(selectedFiles);
    };

    const removePendingAttachment = (attachmentId: string) => {
        setPendingAttachments((current) =>
            current.filter((attachment) => attachment.id !== attachmentId),
        );
    };

    const handleSend = async () => {
        const message = composer.trim();

        if (
            !message ||
            isStreaming ||
            offline ||
            isUploadingAttachment
        ) {
            return;
        }

        const attachmentsToSend = pendingAttachments;
        setComposer('');
        setPendingAttachments([]);
        await runStream(message, messages, attachmentsToSend);
    };

    const handleRegenerate = async (
        assistantMessageId: string,
        options: { asRetry?: boolean } = {},
    ): Promise<void> => {
        if (isStreaming || offline) {
            return;
        }

        const userMessage = findPrecedingUserMessage(assistantMessageId);

        if (!userMessage) {
            toast.error('No user message to regenerate');

            return;
        }

        const prompt = userMessage.content.trim();

        if (!prompt) {
            return;
        }

        if (options.asRetry) {
            // Keep the failed prompt in the composer for optional edit/resend.
            setComposer(prompt);
        }

        const baseMessages = messages.slice(
            0,
            messages.findIndex((entry) => entry.id === userMessage.id),
        );

        const succeeded = await runStream(
            prompt,
            baseMessages,
            userMessage.attachments ?? [],
        );

        if (succeeded && options.asRetry) {
            setComposer('');
            toast.success('Message resent');
        }
    };

    const startEditing = (message: AiChatMessageView) => {
        if (isStreaming) {
            handleStop();
        }

        setEditingMessageId(message.id);
        setEditingDraft(message.content);
    };

    const cancelEditing = () => {
        setEditingMessageId(null);
        setEditingDraft('');
    };

    const handleResendEdited = async (messageId: string) => {
        const draft = editingDraft.trim();

        if (!draft) {
            toast.error('Message cannot be empty');

            return;
        }

        if (isStreaming || offline) {
            return;
        }

        const messageIndex = messages.findIndex(
            (entry) => entry.id === messageId,
        );

        if (messageIndex < 0) {
            return;
        }

        const prior = messages[messageIndex];
        const baseMessages = messages.slice(0, messageIndex);

        setEditingMessageId(null);
        setEditingDraft('');

        await runStream(draft, baseMessages, prior?.attachments ?? []);
    };

    const toggleVoiceInput = () => {
        const Recognition = getSpeechRecognitionConstructor();

        if (!Recognition) {
            toast.error('Dictation is not supported in this browser');

            return;
        }

        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);

            return;
        }

        const recognition = new Recognition();
        recognition.lang = 'it-IT';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognitionRef.current = recognition;

        recognition.addEventListener('result', (event) => {
            let transcript = '';

            for (let index = event.resultIndex; index < event.results.length; index++) {
                const result = event.results[index];

                if (result?.isFinal) {
                    transcript += result[0]?.transcript ?? '';
                }
            }

            if (transcript.trim() !== '') {
                setComposer((current) => {
                    const prefix = current.trim() === '' ? '' : `${current.trim()} `;

                    return `${prefix}${transcript.trim()}`;
                });
            }
        });

        recognition.addEventListener('error', () => {
            setIsListening(false);
            recognitionRef.current = null;
            toast.error('Dictation error');
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
            toast.error('Unable to start dictation');
        }
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        disabled={offline}
                        onClick={() => setOpen(true)}
                        aria-label={
                            offline
                                ? t('ai.assistantOffline')
                                : t('ai.openAssistant')
                        }
                        className={cn(
                            'fixed right-5 bottom-5 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-lg outline-none transition',
                            'focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2',
                            offline
                                ? 'cursor-not-allowed bg-zinc-400 opacity-70'
                                : 'bg-gradient-to-br from-orange-500 via-rose-500 to-amber-400 hover:scale-105',
                        )}
                    >
                        <Sparkles className="size-6" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                    {offline
                        ? t('ai.aiOfflineHint')
                        : status.model
                          ? `${t('ai.assistantOnline')} (${status.model})`
                          : t('ai.assistantOnline')}
                </TooltipContent>
            </Tooltip>

            <Drawer open={open} onOpenChange={setOpen} direction="right">
                <DrawerContent>
                    <DrawerHeader>
                        <DrawerTitle>New chat</DrawerTitle>
                        <DrawerDescription>
                            Quick assistant drawer. Open the full page for history.
                        </DrawerDescription>
                    </DrawerHeader>

                    <AiChatDropZone
                        disabled={
                            offline || isStreaming || isUploadingAttachment
                        }
                        onFilesSelected={(files) =>
                            void handleAttachmentFiles(files)
                        }
                    >
                        <DrawerBody className="gap-3">
                            <AiChatMessages
                                messages={messages}
                                isStreaming={isStreaming}
                                actionsDisabled={offline}
                                editingMessageId={editingMessageId}
                                editingDraft={editingDraft}
                                onEditingDraftChange={setEditingDraft}
                                onCancelEdit={cancelEditing}
                                onStartEdit={startEditing}
                                onResendEdited={(messageId) =>
                                    void handleResendEdited(messageId)
                                }
                                onRegenerate={(messageId, options) =>
                                    void handleRegenerate(messageId, options)
                                }
                                onSuggestedAction={setComposer}
                                emptyState={
                                    <p className="text-sm text-muted-foreground">
                                        Ask about collections, items, or files.
                                    </p>
                                }
                            />
                            {toolHint ? (
                                <p className="text-xs text-muted-foreground">
                                    {toolHint}
                                </p>
                            ) : null}
                        </DrawerBody>

                        <DrawerFooter className="gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={AI_CHAT_ATTACHMENT_ACCEPT}
                                multiple
                                className="hidden"
                                onChange={(event) =>
                                    void handleAttachmentSelected(event)
                                }
                            />
                            <AiComposer
                                value={composer}
                                onChange={setComposer}
                                onSubmit={() => void handleSend()}
                                onStop={handleStop}
                                isStreaming={isStreaming}
                                disabled={offline}
                                placeholder={
                                    offline
                                        ? t('ai.offlinePlaceholder')
                                        : t('ai.askSomething')
                                }
                                attachments={pendingAttachments}
                                onRemoveAttachment={removePendingAttachment}
                                onAttach={() => fileInputRef.current?.click()}
                                isUploadingAttachment={isUploadingAttachment}
                                attachDisabled={
                                    pendingAttachments.length >=
                                    AI_CHAT_ATTACHMENT_MAX_COUNT
                                }
                                speechSupported={speechSupported}
                                isListening={isListening}
                                onToggleVoice={toggleVoiceInput}
                                onOpenPresets={() => setPresetsOpen(true)}
                                attachTooltip={t('ai.attachTooltip')}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="self-start"
                            >
                                <Link href={aiIndex.url()}>
                                    Open full assistant
                                </Link>
                            </Button>
                        </DrawerFooter>
                    </AiChatDropZone>
                </DrawerContent>
            </Drawer>

            <AiActionPresetsDrawer
                nested
                open={presetsOpen}
                onOpenChange={setPresetsOpen}
                onSelect={(prompt) => setComposer(prompt)}
            />
        </>
    );
}
