import { Head, router, usePage } from '@inertiajs/react';
import {
    MessagesSquare,
    MoreHorizontal,
    Pin,
    Plus,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { AiActionPresetsDrawer } from '@/components/ai/ai-action-presets-drawer';
import { AiChatDropZone } from '@/components/ai/ai-chat-drop-zone';
import { AiChatMessages } from '@/components/ai/ai-chat-messages';
import { AiComposer } from '@/components/ai/ai-composer';
import { AiContextAttachDialog } from '@/components/ai/ai-context-attach-dialog';
import {
    fileCardsFromToolResult,
    fileCardsFromToolResults,
} from '@/components/ai/ai-file-cards';
import type { AiFileCardItem } from '@/components/ai/ai-file-cards';
import { FilterSearch } from '@/components/layout/page-header';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import AppLayout from '@/layouts/app-layout';
import {
    AI_CHAT_ATTACHMENT_ACCEPT,
    AI_CHAT_ATTACHMENT_MAX_COUNT,
    awaitingApprovalContent,
    bulkDeleteAiConversations,
    createAiConversation,
    deleteAiConversation,
    fetchAiImportJobStatus,
    fetchAiConversationsPage,
    getSpeechRecognitionConstructor,
    isAbortError,
    pickAiChatAttachmentFiles,
    stopSpeaking,
    streamAiChat,
    toggleAiConversationPin,
    truncateAiConversationFrom,
    truncateLastUserMessageIfMatches,
    uploadAiAttachment,
} from '@/lib/ai-chat';
import type {
    AiApprovalDecision,
    AiChatAttachment,
    AiConversationSummary,
    AiImportJobStatus,
    AiPendingApproval,
} from '@/lib/ai-chat';
import type { AiPendingContextAttachment } from '@/lib/ai-context';
import { contextIdsFromPending } from '@/lib/ai-context';
import { speechRecognitionLang } from '@/lib/format';
import i18n from '@/lib/i18n';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { STRING_LIMITS } from '@/lib/string-limits';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { index as aiIndex, show as aiShow } from '@/routes/ai';
import type { Paginated } from '@/types/admin';

type ConversationSummary = AiConversationSummary;

type ChatMessage = {
    id: string;
    role: string;
    content: string;
    isError?: boolean;
    toolHint?: string | null;
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

type InFlightTurn = {
    prompt: string;
    attachments: AiChatAttachment[];
    userMessageId: string;
    assistantMessageId: string;
};

function toolFallbackContent(
    toolsUsed: string[] = [],
    toolCalls?: ChatMessage['tool_calls'],
): string {
    const namesFromCalls =
        toolCalls
            ?.map((toolCall) => toolCall.name ?? toolCall.function?.name)
            .filter(
                (name): name is string =>
                    typeof name === 'string' && name !== '',
            ) ?? [];
    const uniqueTools = [...new Set([...toolsUsed, ...namesFromCalls])];
    const toolLabel = uniqueTools.length > 0 ? uniqueTools.join(', ') : 'tool';

    return `Completed via ${toolLabel}. Ask me to verify the result if needed.`;
}

type Props = {
    conversations:
        LaravelPaginated<ConversationSummary> | Paginated<ConversationSummary>;
    selectedConversation: ConversationSummary | null;
    messages: ChatMessage[];
};

type ConversationSection = {
    key: string;
    label: string;
    conversations: ConversationSummary[];
};

function isPersistedMessageId(messageId: string): boolean {
    return !messageId.startsWith('local-');
}

/** Secure-context-safe id — crypto.randomUUID is unavailable on http://*.test */
function createLocalMessageId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function importJobIdFromToolResult(result: unknown): string | null {
    const parsed =
        typeof result === 'string'
            ? (() => {
                  try {
                      return JSON.parse(result) as unknown;
                  } catch {
                      return null;
                  }
              })()
            : result;

    if (!parsed || typeof parsed !== 'object' || !('job_id' in parsed)) {
        return null;
    }

    return typeof parsed.job_id === 'string' ? parsed.job_id : null;
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;

    return Math.round(
        (startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) /
            millisecondsPerDay,
    );
}

function conversationDateGroup(updatedAt: string | null | undefined): {
    key: string;
    label: string;
    order: number;
} {
    const now = new Date();
    const updated = updatedAt ? new Date(updatedAt) : now;
    const dayDelta = daysBetween(updated, now);

    if (dayDelta <= 0) {
        return { key: 'today', label: i18n.t('ai.today'), order: 0 };
    }

    if (dayDelta === 1) {
        return { key: 'yesterday', label: i18n.t('ai.yesterday'), order: 1 };
    }

    if (dayDelta === 2) {
        return { key: '2-days', label: i18n.t('ai.twoDaysAgo'), order: 2 };
    }

    if (dayDelta < 7) {
        return { key: 'week', label: i18n.t('ai.thisWeek'), order: 3 };
    }

    if (dayDelta < 14) {
        return { key: 'last-week', label: i18n.t('ai.aWeekAgo'), order: 4 };
    }

    if (dayDelta < 30) {
        return { key: 'month', label: i18n.t('ai.thisMonth'), order: 5 };
    }

    return { key: 'older', label: i18n.t('ai.older'), order: 6 };
}

function groupConversations(
    conversations: ConversationSummary[],
): ConversationSection[] {
    const pinned = conversations.filter(
        (conversation) => conversation.pinned_at != null,
    );
    const unpinned = conversations.filter(
        (conversation) => conversation.pinned_at == null,
    );

    const sections: ConversationSection[] = [];

    if (pinned.length > 0) {
        sections.push({
            key: 'pinned',
            label: 'Pinned',
            conversations: pinned,
        });
    }

    const buckets = new Map<string, ConversationSection & { order: number }>();

    for (const conversation of unpinned) {
        const group = conversationDateGroup(conversation.updated_at);

        const existing = buckets.get(group.key);

        if (existing) {
            existing.conversations.push(conversation);
        } else {
            buckets.set(group.key, {
                key: group.key,
                label: group.label,
                order: group.order,
                conversations: [conversation],
            });
        }
    }

    for (const section of [...buckets.values()].sort(
        (left, right) => left.order - right.order,
    )) {
        sections.push({
            key: section.key,
            label: section.label,
            conversations: section.conversations,
        });
    }

    return sections;
}

function conversationUrl(conversationId: string | null): string {
    if (!conversationId) {
        return aiIndex.url();
    }

    return aiShow.url(conversationId);
}

/**
 * Full-page AI assistant chat interface.
 * @param {*} props.conversations - conversations.
 * @param {*} props.messages - messages.
 * @returns {JSX.Element}
 */
export default function AiIndexPage({
    conversations: conversationsProp,
    selectedConversation,
    messages: initialMessages,
}: Props) {
    const { t, i18n } = useTranslation();
    const page = usePage();
    const initialPaginated = normalizePaginated(conversationsProp);
    const [composer, setComposer] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [toolHint, setToolHint] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [conversationId, setConversationId] = useState<string | null>(
        selectedConversation?.id ?? null,
    );
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    );
    const [editingDraft, setEditingDraft] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [speechSupported] = useState(
        () => getSpeechRecognitionConstructor() !== null,
    );
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [conversationItems, setConversationItems] = useState<
        ConversationSummary[]
    >(initialPaginated.data);
    const [listPage, setListPage] = useState(initialPaginated.current_page);
    const [listLastPage, setListLastPage] = useState(
        initialPaginated.last_page,
    );
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [conversationQuery, setConversationQuery] = useState('');
    const hasSearchedConversationsRef = useRef(false);
    const [pendingAttachments, setPendingAttachments] = useState<
        AiChatAttachment[]
    >([]);
    const [pendingContextAttachments, setPendingContextAttachments] = useState<
        AiPendingContextAttachment[]
    >([]);
    const [contextAttachOpen, setContextAttachOpen] = useState(false);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [dryRunMode, setDryRunMode] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [importJobStatus, setImportJobStatus] =
        useState<AiImportJobStatus | null>(null);

    const conversationIdRef = useRef<string | null>(
        selectedConversation?.id ?? null,
    );
    const isStreamingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const inFlightTurnRef = useRef<InFlightTurn | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const lastSelectedIndexRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const importPollTimeoutRef = useRef<number | null>(null);
    const importPollJobIdRef = useRef<string | null>(null);
    const importPollActiveRef = useRef(false);

    // Sync Inertia props when the selected conversation changes — never while streaming.
    useEffect(() => {
        if (isStreamingRef.current) {
            return;
        }

        // Tool-only turns: prefer server summary; never keep a permanently blank assistant bubble.
        const syncedMessages = initialMessages.flatMap((message) => {
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

        setMessages(syncedMessages);
        setConversationId(selectedConversation?.id ?? null);
        conversationIdRef.current = selectedConversation?.id ?? null;
        setEditingMessageId(null);
        setEditingDraft('');
    }, [initialMessages, selectedConversation?.id, page.url]);

    // Fingerprint server list content so a new props object with the same rows
    // cannot wipe optimistic local removals (fetch-delete leaves Inertia props stale).
    const conversationsSyncKey = useMemo(() => {
        const paginated = normalizePaginated(conversationsProp);

        return JSON.stringify({
            current_page: paginated.current_page,
            last_page: paginated.last_page,
            items: paginated.data.map((conversation) => [
                String(conversation.id),
                conversation.pinned_at ?? null,
                conversation.title,
                conversation.updated_at ?? null,
            ]),
        });
    }, [conversationsProp]);

    useEffect(() => {
        const nextPage = normalizePaginated(conversationsProp);

        setConversationItems(nextPage.data);
        setListPage(nextPage.current_page);
        setListLastPage(nextPage.last_page);
        lastSelectedIndexRef.current = null;
        // conversationsSyncKey is a content fingerprint of conversationsProp
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resetting on prop identity alone
    }, [conversationsSyncKey]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, toolHint]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
            recognitionRef.current?.abort();
            stopSpeaking();
        };
    }, []);

    const conversationSections = useMemo(
        () => groupConversations(conversationItems),
        [conversationItems],
    );

    const flatConversationIds = useMemo(
        () =>
            conversationSections.flatMap((section) =>
                section.conversations.map((conversation) => conversation.id),
            ),
        [conversationSections],
    );

    const conversationIndexById = useMemo(() => {
        const indexes = new Map<string, number>();

        flatConversationIds.forEach((conversationId, index) => {
            indexes.set(conversationId, index);
        });

        return indexes;
    }, [flatConversationIds]);

    const hasMoreConversations = listPage < listLastPage;

    const selectConversation = (id: string) => {
        if (isStreamingRef.current) {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            isStreamingRef.current = false;
            setIsStreaming(false);
        }

        router.get(
            conversationUrl(id),
            {},
            { preserveState: false, preserveScroll: true },
        );
    };

    const handleNewChat = async () => {
        try {
            const conversation = await createAiConversation();
            router.get(
                conversationUrl(conversation.id),
                {},
                { preserveState: false },
            );
        } catch {
            toast.error(t('ai.unableStartChat'));
        }
    };

    const removeConversationsFromSidebar = (ids: string[]) => {
        const deletedIds = new Set(ids.map(String));

        setConversationItems((current) =>
            current.filter(
                (conversation) => !deletedIds.has(String(conversation.id)),
            ),
        );
        setSelectedIds((current) => {
            const next = new Set(current);

            for (const deletedId of deletedIds) {
                next.delete(deletedId);
            }

            return next;
        });
        lastSelectedIndexRef.current = null;
    };

    const refreshConversationsAfterDelete = (selectedWasDeleted: boolean) => {
        // Prefetch cache defaults to fresh:false (30s) — without this, /ai can
        // reappear with deleted rows and the sync effect resurrects them.
        router.flushAll();

        if (selectedWasDeleted) {
            router.get(
                aiIndex.url(),
                {},
                { preserveState: false, fresh: true },
            );

            return;
        }

        router.reload({ only: ['conversations'], fresh: true });
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteAiConversation(id);
            toast.success(t('ai.chatDeleted'));
            removeConversationsFromSidebar([id]);
            refreshConversationsAfterDelete(conversationId === id);
        } catch {
            toast.error(t('ai.unableDeleteChat'));
        }
    };

    const handleTogglePin = async (id: string) => {
        try {
            await toggleAiConversationPin(id);
            router.reload({
                only: ['conversations', 'selectedConversation'],
            });
        } catch {
            toast.error(t('ai.unableUpdatePin'));
        }
    };

    const toggleSelected = (id: string, checked: boolean, index: number) => {
        lastSelectedIndexRef.current = index;
        setSelectedIds((current) => {
            const next = new Set(current);

            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }

            return next;
        });
    };

    const selectRange = (fromIndex: number, toIndex: number) => {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);

        setSelectedIds((current) => {
            const next = new Set(current);

            for (let index = start; index <= end; index++) {
                const conversationIdInRange = flatConversationIds[index];

                if (conversationIdInRange) {
                    next.add(conversationIdInRange);
                }
            }

            return next;
        });
    };

    const handleCheckboxPointerDown = (
        event: ReactPointerEvent,
        index: number,
    ) => {
        if (!event.shiftKey || lastSelectedIndexRef.current === null) {
            return;
        }

        // Prevent Radix toggle so shift-click only expands the range.
        event.preventDefault();
        selectRange(lastSelectedIndexRef.current, index);
    };

    // Server-side title search (debounced): replaces the loaded list with page 1.
    useEffect(() => {
        if (!hasSearchedConversationsRef.current && conversationQuery === '') {
            return;
        }

        hasSearchedConversationsRef.current = true;
        let cancelled = false;
        const timeoutId = window.setTimeout(() => {
            void fetchAiConversationsPage(1, 25, conversationQuery.trim())
                .then((firstPage) => {
                    if (cancelled) {
                        return;
                    }

                    setConversationItems(firstPage.data);
                    setListPage(firstPage.current_page);
                    setListLastPage(firstPage.last_page);
                })
                .catch(() => {
                    if (!cancelled) {
                        toast.error(t('ai.unableLoadMoreChats'));
                    }
                });
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [conversationQuery, t]);

    const handleLoadMoreConversations = async () => {
        if (isLoadingMore || !hasMoreConversations) {
            return;
        }

        setIsLoadingMore(true);

        try {
            const nextPage = await fetchAiConversationsPage(
                listPage + 1,
                25,
                conversationQuery.trim(),
            );
            setConversationItems((current) => {
                const seenIds = new Set(
                    current.map((conversation) => conversation.id),
                );
                const appended = nextPage.data.filter(
                    (conversation) => !seenIds.has(conversation.id),
                );

                return [...current, ...appended];
            });
            setListPage(nextPage.current_page);
            setListLastPage(nextPage.last_page);
        } catch {
            toast.error(t('ai.unableLoadMoreChats'));
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleBulkDelete = async () => {
        const ids = [...selectedIds].map(String);

        if (ids.length === 0) {
            return;
        }

        setIsBulkDeleting(true);

        try {
            await bulkDeleteAiConversations(ids);
            toast.success(
                ids.length === 1
                    ? t('ai.chatDeleted')
                    : t('ai.chatsDeleted', { count: ids.length }),
            );

            removeConversationsFromSidebar(ids);
            setConfirmBulkDeleteOpen(false);

            const selectedWasDeleted =
                conversationId !== null && ids.includes(String(conversationId));

            refreshConversationsAfterDelete(selectedWasDeleted);
        } catch {
            toast.error(t('ai.unableDeleteSelectedChats'));
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const reloadConversation = (resolvedConversationId: string | null) => {
        // Clear abort handle before Inertia navigation so unmount cleanup cannot
        // race-abort a just-finished stream or confuse follow-up sends.
        abortControllerRef.current = null;

        router.get(
            conversationUrl(resolvedConversationId),
            {},
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: ['conversations', 'selectedConversation', 'messages'],
            },
        );
    };

    const handleStop = () => {
        const inFlightTurn = inFlightTurnRef.current;
        const abortController = abortControllerRef.current;

        // Mark streaming finished before abort so late onDone/onToken see the flag.
        isStreamingRef.current = false;
        setIsStreaming(false);
        setToolHint(null);

        abortController?.abort();
        abortControllerRef.current = null;

        if (!inFlightTurn) {
            // Drop empty in-flight assistant bubble so stop never leaves a blank card.
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

    const clearImportPoll = (): void => {
        if (importPollTimeoutRef.current != null) {
            window.clearTimeout(importPollTimeoutRef.current);
            importPollTimeoutRef.current = null;
        }
    };

    const runImportPollRef = useRef<(jobId: string) => Promise<void>>(
        async () => {},
    );

    runImportPollRef.current = async (jobId: string): Promise<void> => {
        if (importPollJobIdRef.current !== jobId) {
            return;
        }

        if (document.hidden) {
            return;
        }

        try {
            const status = await fetchAiImportJobStatus(jobId);

            if (importPollJobIdRef.current !== jobId) {
                return;
            }

            setImportJobStatus(status);

            if (status.status === 'queued' || status.status === 'running') {
                clearImportPoll();
                importPollTimeoutRef.current = window.setTimeout(() => {
                    void runImportPollRef.current(jobId);
                }, 2000);
            } else {
                importPollActiveRef.current = false;
            }
        } catch {
            if (importPollJobIdRef.current === jobId) {
                setImportJobStatus(null);
                importPollActiveRef.current = false;
            }
        }
    };

    const startImportPoll = (jobId: string): void => {
        clearImportPoll();
        importPollJobIdRef.current = jobId;
        importPollActiveRef.current = true;
        void runImportPollRef.current(jobId);
    };

    useEffect(() => {
        const onVisibilityChange = (): void => {
            const jobId = importPollJobIdRef.current;

            if (!document.hidden && jobId && importPollActiveRef.current) {
                void runImportPollRef.current(jobId);
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            document.removeEventListener(
                'visibilitychange',
                onVisibilityChange,
            );
            clearImportPoll();
            importPollJobIdRef.current = null;
            importPollActiveRef.current = false;
        };
    }, []);

    const markAssistantError = (
        assistantMessageId: string,
        message: string,
    ) => {
        setMessages((current) =>
            current.map((entry) =>
                entry.id === assistantMessageId
                    ? {
                          ...entry,
                          content: message,
                          isError: true,
                      }
                    : entry,
            ),
        );
    };

    const runStream = async (
        message: string,
        options: {
            conversationIdForStream: string | null;
            baseMessages: ChatMessage[];
            attachments?: AiChatAttachment[];
            contextAttachments?: AiPendingContextAttachment[];
            approvals?: AiApprovalDecision[];
        },
    ): Promise<boolean> => {
        const attachmentsForMessage = options.attachments ?? [];
        const contextForMessage = options.contextAttachments ?? [];
        const contextIds = contextIdsFromPending(contextForMessage);
        const approvalDecisions = options.approvals ?? [];
        const isResume = approvalDecisions.length > 0;
        let approvalsRequested: AiPendingApproval[] = [];
        const userMessageId = createLocalMessageId('local-user');
        const assistantMessageId = createLocalMessageId('local-assistant');
        const userMessage: ChatMessage = {
            id: userMessageId,
            role: 'user',
            content: message,
            attachments: attachmentsForMessage,
        };
        let completed = false;
        let toolsCalled = false;
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
            ...options.baseMessages,
            ...(isResume ? [] : [userMessage]),
            { id: assistantMessageId, role: 'assistant', content: '' },
        ]);
        isStreamingRef.current = true;
        setIsStreaming(true);
        setToolHint(null);
        stopSpeaking();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            await streamAiChat(
                message,
                options.conversationIdForStream,
                {
                    signal: abortController.signal,
                    onToken: (token) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        setMessages((current) =>
                            current.map((entry) =>
                                entry.id === assistantMessageId
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

                        toolsCalled = true;
                        toolsUsed.push(toolName);
                        setToolHint(`Chiamata ${toolName}…`);
                    },
                    onToolResult: (toolName, result) => {
                        const jobId = importJobIdFromToolResult(result);

                        if (jobId) {
                            startImportPoll(jobId);
                        }

                        const cards = fileCardsFromToolResult(toolName, result);

                        if (cards.length === 0) {
                            return;
                        }

                        setMessages((current) =>
                            current.map((entry) => {
                                if (entry.id !== assistantMessageId) {
                                    return entry;
                                }

                                const byId = new Map(
                                    (entry.fileCards ?? []).map((file) => [
                                        file.id,
                                        file,
                                    ]),
                                );

                                for (const file of cards) {
                                    byId.set(file.id, file);
                                }

                                return {
                                    ...entry,
                                    fileCards: [...byId.values()],
                                };
                            }),
                        );
                    },
                    onApprovalRequest: (approvals) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        approvalsRequested = [
                            ...approvalsRequested,
                            ...approvals,
                        ];
                        setMessages((current) =>
                            current.map((entry) =>
                                entry.id === assistantMessageId
                                    ? {
                                          ...entry,
                                          pending_approvals: approvalsRequested,
                                      }
                                    : entry,
                            ),
                        );
                    },
                    onConversationId: (id) => {
                        // Keep conversation id even after stop so truncate cleanup can run.
                        conversationIdRef.current = id;
                        setConversationId(id);
                    },
                    onDone: (fullText) => {
                        // Stop already rolled back UI; never reload/navigate after abort.
                        if (abortController.signal.aborted) {
                            return;
                        }

                        completed = true;
                        inFlightTurnRef.current = null;
                        abortControllerRef.current = null;
                        setToolHint(null);
                        isStreamingRef.current = false;
                        setIsStreaming(false);

                        const trimmed = fullText.trim();

                        if (approvalsRequested.length > 0) {
                            setMessages((current) =>
                                current.map((entry) =>
                                    entry.id === assistantMessageId
                                        ? {
                                              ...entry,
                                              content:
                                                  trimmed !== ''
                                                      ? fullText
                                                      : awaitingApprovalContent(
                                                            approvalsRequested,
                                                        ),
                                              isError: false,
                                              pending_approvals:
                                                  approvalsRequested,
                                          }
                                        : entry,
                                ),
                            );
                            reloadConversation(conversationIdRef.current);

                            return;
                        }

                        if (trimmed === '') {
                            // Tool-only turns often end with no final text tokens from local models.
                            if (toolsCalled) {
                                const fallback = toolFallbackContent(toolsUsed);
                                setMessages((current) =>
                                    current.map((entry) =>
                                        entry.id === assistantMessageId
                                            ? {
                                                  ...entry,
                                                  content: fallback,
                                                  isError: false,
                                                  toolNames: [
                                                      ...new Set(toolsUsed),
                                                  ],
                                              }
                                            : entry,
                                    ),
                                );
                                // Reload so backfilled server summary (if any) replaces the local fallback.
                                reloadConversation(conversationIdRef.current);

                                return;
                            }

                            markAssistantError(
                                assistantMessageId,
                                t('ai.responseTryAgain'),
                            );
                            toast.error(t('ai.noResponse'));

                            return;
                        }

                        setMessages((current) =>
                            current.map((entry) =>
                                entry.id === assistantMessageId
                                    ? {
                                          ...entry,
                                          content: fullText,
                                          isError: false,
                                          toolNames: [...new Set(toolsUsed)],
                                      }
                                    : entry,
                            ),
                        );

                        reloadConversation(conversationIdRef.current);
                    },
                    onError: (error) => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        inFlightTurnRef.current = null;
                        abortControllerRef.current = null;
                        isStreamingRef.current = false;
                        setIsStreaming(false);
                        setToolHint(null);
                        markAssistantError(
                            assistantMessageId,
                            error.message || i18n.t('ai.responseError'),
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

            // Stop: streamAiChat swallows AbortError; handleStop already rolled back UI.
            if (abortController.signal.aborted) {
                return false;
            }

            // Stream ended without onDone (truncated body) — settle empty bubbles.
            if (!completed) {
                inFlightTurnRef.current = null;
                setMessages((current) => {
                    const assistant = current.find(
                        (entry) => entry.id === assistantMessageId,
                    );

                    if (
                        assistant &&
                        assistant.content.trim() === '' &&
                        !assistant.isError
                    ) {
                        if (toolsCalled) {
                            return current.map((entry) =>
                                entry.id === assistantMessageId
                                    ? {
                                          ...entry,
                                          content:
                                              toolFallbackContent(toolsUsed),
                                          isError: false,
                                      }
                                    : entry,
                            );
                        }

                        return current.map((entry) =>
                            entry.id === assistantMessageId
                                ? {
                                      ...entry,
                                      content: t('ai.responseTryAgain'),
                                      isError: true,
                                  }
                                : entry,
                        );
                    }

                    return current;
                });
                isStreamingRef.current = false;
                setIsStreaming(false);
                setToolHint(null);
            }

            return completed;
        } catch (error) {
            if (isAbortError(error) || abortController.signal.aborted) {
                // handleStop owns rollback + composer restore; avoid error toasts.
                abortControllerRef.current = null;
                isStreamingRef.current = false;
                setIsStreaming(false);
                setToolHint(null);

                return false;
            }

            inFlightTurnRef.current = null;
            abortControllerRef.current = null;
            isStreamingRef.current = false;
            setIsStreaming(false);
            setToolHint(null);

            const messageText =
                error instanceof Error ? error.message : t('ai.responseError');

            markAssistantError(assistantMessageId, messageText);
            toast.error(messageText);

            return false;
        }
    };

    const handlePickAttachment = () => {
        setContextAttachOpen(true);
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
                    : t('ai.attachmentUploadFailed'),
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

    const removePendingContextAttachment = (
        kind: AiPendingContextAttachment['kind'],
        id: number,
    ) => {
        setPendingContextAttachments((current) =>
            current.filter(
                (attachment) =>
                    !(attachment.kind === kind && attachment.id === id),
            ),
        );
    };

    const handleSend = async () => {
        const message = composer.trim();

        if (
            (!message &&
                pendingAttachments.length === 0 &&
                pendingContextAttachments.length === 0) ||
            isStreamingRef.current ||
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
        const prompt = dryRunMode
            ? `[SIMULATION MODE] Run dry_run=true only; do not write data.\n\n${message}`
            : message;
        setComposer('');
        setPendingAttachments([]);
        setPendingContextAttachments([]);

        try {
            await runStream(prompt, {
                conversationIdForStream: conversationIdRef.current,
                baseMessages: messages,
                attachments: attachmentsToSend,
                contextAttachments: contextToSend,
            });
        } catch (error) {
            const messageText =
                error instanceof Error ? error.message : t('ai.sendError');
            toast.error(messageText);
        }
    };

    const handleResolveApprovals = async (
        messageId: string,
        approved: boolean,
    ): Promise<void> => {
        const pausedMessage = messages.find((entry) => entry.id === messageId);
        const pending = pausedMessage?.pending_approvals ?? [];

        if (isStreamingRef.current || pending.length === 0) {
            return;
        }

        await runStream('', {
            conversationIdForStream: conversationIdRef.current,
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

    const findPrecedingUserMessage = (
        assistantMessageId: string,
    ): ChatMessage | null => {
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

    const handleRegenerate = async (
        assistantMessageId: string,
        options: { asRetry?: boolean } = {},
    ): Promise<void> => {
        if (isStreamingRef.current) {
            return;
        }

        const userMessage = findPrecedingUserMessage(assistantMessageId);

        if (!userMessage) {
            toast.error(t('ai.noUserMessageToRegenerate'));

            return;
        }

        const prompt = userMessage.content.trim();

        if (!prompt) {
            return;
        }

        let baseMessages = messages.slice(
            0,
            messages.findIndex((entry) => entry.id === userMessage.id),
        );

        if (conversationId && isPersistedMessageId(userMessage.id)) {
            try {
                await truncateAiConversationFrom(
                    conversationId,
                    userMessage.id,
                );
            } catch {
                toast.error(t('ai.unablePrepareRegeneration'));

                return;
            }
        } else {
            baseMessages = messages.slice(
                0,
                messages.findIndex((entry) => entry.id === userMessage.id),
            );
        }

        const succeeded = await runStream(prompt, {
            conversationIdForStream: conversationIdRef.current,
            baseMessages,
        });

        if (succeeded && options.asRetry) {
            toast.success(t('ai.messageResent'));
        }
    };

    const startEditing = (message: ChatMessage) => {
        if (isStreamingRef.current) {
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
            toast.error(t('ai.messageCannotBeEmpty'));

            return;
        }

        if (isStreamingRef.current) {
            handleStop();
        }

        const messageIndex = messages.findIndex(
            (entry) => entry.id === messageId,
        );

        if (messageIndex < 0) {
            return;
        }

        const baseMessages = messages.slice(0, messageIndex);

        if (conversationId && isPersistedMessageId(messageId)) {
            try {
                await truncateAiConversationFrom(conversationId, messageId);
            } catch {
                toast.error(t('ai.unableEditMessage'));

                return;
            }
        }

        setEditingMessageId(null);
        setEditingDraft('');

        await runStream(draft, {
            conversationIdForStream: conversationIdRef.current,
            baseMessages,
        });
    };

    const toggleVoiceInput = () => {
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

    return (
        <AppLayout
            breadcrumbs={[{ title: t('nav.assistant'), href: aiIndex.url() }]}
            headerActions={
                <Button
                    type="button"
                    onClick={() => void handleNewChat()}
                    data-test="ai-new-chat"
                >
                    <Plus className="size-4" />
                    {t('ai.newChat')}
                </Button>
            }
        >
            <Head title={t('nav.assistant')} />

            <PageLayout
                filters={
                    <FilterSearch
                        dataTest="ai-filter-q"
                        className="w-64 flex-none sm:max-w-none lg:w-80"
                        value={conversationQuery}
                        placeholder={t('ai.searchConversations')}
                        maxLength={STRING_LIMITS.SEARCH_CHAT_HUB}
                        onChange={setConversationQuery}
                    />
                }
                filtersRight={
                    <HeaderIconButton
                        type="button"
                        variant="outline"
                        data-test="ai-delete-selected"
                        disabled={selectedIds.size === 0 || isBulkDeleting}
                        onClick={() => setConfirmBulkDeleteOpen(true)}
                        label={t('a11y.deleteSelectedChats')}
                    >
                        <Trash2 className="size-4" />
                    </HeaderIconButton>
                }
            >
                <div
                    data-test="ai-hub"
                    className="flex min-h-0 flex-1 overflow-hidden"
                >
                    <aside
                        aria-label={t('ai.conversations')}
                        className="flex w-64 shrink-0 flex-col border-r lg:w-80"
                    >
                        <div
                            data-test="ai-list"
                            className={cn(
                                'min-h-0 flex-1 overflow-y-auto p-2',
                                conversationItems.length === 0 &&
                                    'flex flex-col items-center justify-center',
                            )}
                        >
                            {conversationItems.length === 0 ? (
                                <Empty
                                    data-test="ai-list-empty"
                                    className="gap-3 p-6 md:p-6"
                                >
                                    <EmptyHeader>
                                        <EmptyMedia
                                            variant="icon"
                                            className="bg-primary/10 text-primary"
                                        >
                                            <MessagesSquare />
                                        </EmptyMedia>
                                        <EmptyDescription>
                                            {conversationQuery.trim() !== ''
                                                ? t('ai.noConversationsMatch')
                                                : t('ai.noConversations')}
                                        </EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : (
                                <>
                                    {conversationSections.map((section) => (
                                        <div key={section.key} className="mb-3">
                                            <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                {section.key === 'pinned' ? (
                                                    <Pin className="size-3 fill-current" />
                                                ) : null}
                                                {section.label}
                                            </div>
                                            {section.conversations.map(
                                                (conversation) => {
                                                    const index =
                                                        conversationIndexById.get(
                                                            conversation.id,
                                                        ) ?? 0;

                                                    return (
                                                        <div
                                                            key={
                                                                conversation.id
                                                            }
                                                            className={cn(
                                                                'group mb-0.5 flex items-center gap-1 rounded-md',
                                                                conversation.id ===
                                                                    conversationId
                                                                    ? 'bg-muted'
                                                                    : 'hover:bg-muted/60',
                                                            )}
                                                        >
                                                            <Checkbox
                                                                className="ml-2"
                                                                checked={selectedIds.has(
                                                                    conversation.id,
                                                                )}
                                                                onPointerDown={(
                                                                    event,
                                                                ) =>
                                                                    handleCheckboxPointerDown(
                                                                        event,
                                                                        index,
                                                                    )
                                                                }
                                                                onCheckedChange={(
                                                                    checked,
                                                                ) =>
                                                                    toggleSelected(
                                                                        conversation.id,
                                                                        checked ===
                                                                            true,
                                                                        index,
                                                                    )
                                                                }
                                                                aria-label={`Select ${conversation.title}`}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                                                                onClick={() =>
                                                                    selectConversation(
                                                                        conversation.id,
                                                                    )
                                                                }
                                                            >
                                                                {
                                                                    conversation.title
                                                                }
                                                            </button>
                                                            {conversation.pinned_at ? (
                                                                <Pin
                                                                    className="size-3.5 shrink-0 fill-current text-muted-foreground group-hover:hidden group-has-[[data-state=open]]:hidden"
                                                                    aria-hidden
                                                                />
                                                            ) : null}
                                                            {/* ChatGPT / Claude style: conversation actions live on the row, not in a pane header. */}
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger
                                                                    asChild
                                                                >
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                                                        aria-label={t(
                                                                            'a11y.moreActions',
                                                                        )}
                                                                        data-test="ai-conversation-menu"
                                                                    >
                                                                        <MoreHorizontal className="size-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem
                                                                        onSelect={() =>
                                                                            void handleTogglePin(
                                                                                conversation.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Pin className="size-4" />
                                                                        {conversation.pinned_at
                                                                            ? t(
                                                                                  'a11y.unpinChat',
                                                                              )
                                                                            : t(
                                                                                  'a11y.pinChat',
                                                                              )}
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        variant="destructive"
                                                                        data-test="ai-conversation-delete"
                                                                        onSelect={() =>
                                                                            void handleDelete(
                                                                                conversation.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Trash2 className="size-4" />
                                                                        {t(
                                                                            'a11y.deleteChat',
                                                                        )}
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                    ))}
                                    {hasMoreConversations ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="mb-2 w-full text-muted-foreground"
                                            disabled={isLoadingMore}
                                            onClick={() =>
                                                void handleLoadMoreConversations()
                                            }
                                        >
                                            {isLoadingMore
                                                ? t('chatHub.loading')
                                                : t('ai.loadMore')}
                                        </Button>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </aside>

                    <section className="flex min-w-0 flex-1 flex-col">
                        <AiChatDropZone
                            disabled={isStreaming || isUploadingAttachment}
                            onFilesSelected={(files) =>
                                void handleAttachmentFiles(files)
                            }
                        >
                            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                                <AiChatMessages
                                    messages={messages}
                                    isStreaming={isStreaming}
                                    editingMessageId={editingMessageId}
                                    editingDraft={editingDraft}
                                    onEditingDraftChange={setEditingDraft}
                                    onCancelEdit={cancelEditing}
                                    onStartEdit={startEditing}
                                    onResendEdited={(messageId) =>
                                        void handleResendEdited(messageId)
                                    }
                                    onRegenerate={(messageId, options) =>
                                        void handleRegenerate(
                                            messageId,
                                            options,
                                        )
                                    }
                                    onSuggestedAction={setComposer}
                                    onResolveApprovals={(messageId, approved) =>
                                        void handleResolveApprovals(
                                            messageId,
                                            approved,
                                        )
                                    }
                                    emptyState={
                                        <Empty
                                            data-test="ai-pane-empty"
                                            className="m-auto"
                                        >
                                            <EmptyHeader>
                                                <EmptyMedia
                                                    variant="icon"
                                                    className="bg-ai/10 text-ai"
                                                >
                                                    <Sparkles />
                                                </EmptyMedia>
                                                <EmptyDescription>
                                                    {t('ai.paneEmpty')}
                                                </EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    }
                                />

                                {toolHint ? (
                                    <p className="text-xs text-muted-foreground">
                                        {toolHint}
                                    </p>
                                ) : null}
                                {importJobStatus ? (
                                    <p className="text-xs text-muted-foreground">
                                        Importazione {importJobStatus.status}:{' '}
                                        {importJobStatus.processed}
                                        {importJobStatus.total !== null
                                            ? `/${importJobStatus.total}`
                                            : ''}
                                        {' — '}
                                        {importJobStatus.message}
                                    </p>
                                ) : null}
                                <div ref={bottomRef} />
                            </div>

                            <div className="border-t p-3">
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
                                    attachments={pendingAttachments}
                                    onRemoveAttachment={removePendingAttachment}
                                    contextAttachments={
                                        pendingContextAttachments
                                    }
                                    onRemoveContextAttachment={
                                        removePendingContextAttachment
                                    }
                                    onAttach={handlePickAttachment}
                                    isUploadingAttachment={
                                        isUploadingAttachment
                                    }
                                    attachDisabled={
                                        pendingAttachments.length >=
                                        AI_CHAT_ATTACHMENT_MAX_COUNT
                                    }
                                    speechSupported={speechSupported}
                                    isListening={isListening}
                                    onToggleVoice={toggleVoiceInput}
                                    dryRunMode={dryRunMode}
                                    onDryRunModeChange={setDryRunMode}
                                    onOpenPresets={() => setPresetsOpen(true)}
                                />
                            </div>
                        </AiChatDropZone>
                    </section>
                </div>
            </PageLayout>

            <AiContextAttachDialog
                open={contextAttachOpen}
                onOpenChange={setContextAttachOpen}
                onAttach={(entries) => {
                    setPendingContextAttachments((current) => {
                        const next = [...current];

                        for (const entry of entries) {
                            if (
                                !next.some(
                                    (row) =>
                                        row.kind === entry.kind &&
                                        row.id === entry.id,
                                )
                            ) {
                                next.push(entry);
                            }
                        }

                        return next;
                    });
                }}
                onPickUploadFiles={() => {
                    setContextAttachOpen(false);
                    fileInputRef.current?.click();
                }}
            />

            <AiActionPresetsDrawer
                open={presetsOpen}
                onOpenChange={setPresetsOpen}
                onSelect={(prompt) => setComposer(prompt)}
            />

            <Dialog
                open={confirmBulkDeleteOpen}
                onOpenChange={setConfirmBulkDeleteOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete selected chats?</DialogTitle>
                        <DialogDescription>
                            You are about to delete {selectedIds.size} chats.
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmBulkDeleteOpen(false)}
                            disabled={isBulkDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleBulkDelete()}
                            disabled={isBulkDeleting}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
