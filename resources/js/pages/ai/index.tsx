import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Mic,
    MicOff,
    Pin,
    Plus,
    RefreshCw,
    Sparkles,
    Square,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from 'react';
import { AssistantMarkdown } from '@/components/ai/assistant-markdown';
import { AssistantMessageActions } from '@/components/ai/assistant-message-actions';
import { ThinkingDots } from '@/components/ai/thinking-dots';
import { UserMessageActions } from '@/components/ai/user-message-actions';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
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
import { Input } from '@/components/ui/input';
import { Message, MessageContent, MessageFooter } from '@/components/ui/message';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import {
    bulkDeleteAiConversations,
    createAiConversation,
    deleteAiConversation,
    fetchAiConversationsPage,
    getSpeechRecognitionConstructor,
    stopSpeaking,
    streamAiChat,
    toggleAiConversationPin,
    truncateAiConversationFrom,
    type AiConversationSummary,
} from '@/lib/ai-chat';
import { normalizePaginated, type LaravelPaginated } from '@/lib/pagination';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { index as aiIndex, show as aiShow } from '@/routes/ai';
import type { BreadcrumbItem } from '@/types';
import type { Paginated } from '@/types/admin';

type ConversationSummary = AiConversationSummary;

type ChatMessage = {
    id: string;
    role: string;
    content: string;
    isError?: boolean;
    toolHint?: string | null;
};

type Props = {
    conversations:
        | LaravelPaginated<ConversationSummary>
        | Paginated<ConversationSummary>;
    selectedConversation: ConversationSummary | null;
    messages: ChatMessage[];
};

type ConversationSection = {
    key: string;
    label: string;
    conversations: ConversationSummary[];
};

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Assistente',
        href: aiIndex.url(),
    },
];

function isPersistedMessageId(messageId: string): boolean {
    return !messageId.startsWith('local-');
}

/** Secure-context-safe id — crypto.randomUUID is unavailable on http://*.test */
function createLocalMessageId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
        return { key: 'oggi', label: 'Oggi', order: 0 };
    }

    if (dayDelta === 1) {
        return { key: 'ieri', label: 'Ieri', order: 1 };
    }

    if (dayDelta === 2) {
        return { key: '2-giorni', label: '2 giorni fa', order: 2 };
    }

    if (dayDelta < 7) {
        return { key: 'settimana', label: 'Questa settimana', order: 3 };
    }

    if (dayDelta < 14) {
        return { key: 'una-settimana', label: 'Una settimana fa', order: 4 };
    }

    if (dayDelta < 30) {
        return { key: 'mese', label: 'Questo mese', order: 5 };
    }

    return { key: 'older', label: 'Più vecchie', order: 6 };
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
            label: 'Fissate',
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

export default function AiIndexPage({
    conversations: conversationsProp,
    selectedConversation,
    messages: initialMessages,
}: Props) {
    const page = usePage();
    const initialPaginated = normalizePaginated(conversationsProp);
    const [composer, setComposer] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [toolHint, setToolHint] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [conversationId, setConversationId] = useState<string | null>(
        selectedConversation?.id ?? null,
    );
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
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
    const [listLastPage, setListLastPage] = useState(initialPaginated.last_page);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const conversationIdRef = useRef<string | null>(
        selectedConversation?.id ?? null,
    );
    const isStreamingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const lastSelectedIndexRef = useRef<number | null>(null);

    // Sync Inertia props when the selected conversation changes — never while streaming.
    useEffect(() => {
        if (isStreamingRef.current) {
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror server props into local chat state
        setMessages(initialMessages);
        setConversationId(selectedConversation?.id ?? null);
        conversationIdRef.current = selectedConversation?.id ?? null;
        setEditingMessageId(null);
        setEditingDraft('');
    }, [initialMessages, selectedConversation?.id, page.url]);

    useEffect(() => {
        const nextPage = normalizePaginated(conversationsProp);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset list when Inertia refreshes conversations
        setConversationItems(nextPage.data);
        setListPage(nextPage.current_page);
        setListLastPage(nextPage.last_page);
        lastSelectedIndexRef.current = null;
    }, [conversationsProp]);

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

    const selectedTitle = useMemo(() => {
        return (
            conversationItems.find(
                (conversation) => conversation.id === conversationId,
            )?.title ??
            selectedConversation?.title ??
            'Nuova chat'
        );
    }, [conversationItems, conversationId, selectedConversation?.title]);

    const selectConversation = (id: string) => {
        if (isStreamingRef.current) {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            isStreamingRef.current = false;
            setIsStreaming(false);
        }

        router.get(conversationUrl(id), {}, { preserveState: false, preserveScroll: true });
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
            toast.error('Impossibile avviare una nuova chat');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteAiConversation(id);
            toast.success('Chat eliminata');
            setConversationItems((current) =>
                current.filter((conversation) => conversation.id !== id),
            );
            setSelectedIds((current) => {
                const next = new Set(current);
                next.delete(id);

                return next;
            });

            if (conversationId === id) {
                router.get(aiIndex.url(), {}, { preserveState: false });
            }
        } catch {
            toast.error('Impossibile eliminare la chat');
        }
    };

    const handleTogglePin = async (id: string) => {
        try {
            await toggleAiConversationPin(id);
            router.reload({
                only: ['conversations', 'selectedConversation'],
            });
        } catch {
            toast.error('Impossibile aggiornare il pin');
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

    const handleLoadMoreConversations = async () => {
        if (isLoadingMore || !hasMoreConversations) {
            return;
        }

        setIsLoadingMore(true);

        try {
            const nextPage = await fetchAiConversationsPage(listPage + 1);
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
            toast.error('Impossibile caricare altre chat');
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleBulkDelete = async () => {
        const ids = [...selectedIds];

        if (ids.length === 0) {
            return;
        }

        setIsBulkDeleting(true);

        try {
            await bulkDeleteAiConversations(ids);
            toast.success(
                ids.length === 1
                    ? 'Chat eliminata'
                    : `${ids.length} chat eliminate`,
            );

            const deletedIds = new Set(ids);
            setConversationItems((current) =>
                current.filter(
                    (conversation) => !deletedIds.has(conversation.id),
                ),
            );
            setSelectedIds(new Set());
            setConfirmBulkDeleteOpen(false);
            lastSelectedIndexRef.current = null;

            const selectedWasDeleted =
                conversationId !== null && deletedIds.has(conversationId);

            // ponytail: fetch delete + same-URL router.get won't refresh conversationItems
            if (selectedWasDeleted) {
                router.get(aiIndex.url(), {}, { preserveState: false });
            }
        } catch {
            toast.error('Impossibile eliminare le chat selezionate');
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
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
        setToolHint(null);
    };

    const markAssistantError = (assistantMessageId: string, message: string) => {
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
        },
    ): Promise<boolean> => {
        const userMessage: ChatMessage = {
            id: createLocalMessageId('local-user'),
            role: 'user',
            content: message,
        };
        const assistantMessageId = createLocalMessageId('local-assistant');
        let completed = false;

        setMessages([
            ...options.baseMessages,
            userMessage,
            { id: assistantMessageId, role: 'assistant', content: '' },
        ]);
        isStreamingRef.current = true;
        setIsStreaming(true);
        setToolHint(null);
        stopSpeaking();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            await streamAiChat(message, options.conversationIdForStream, {
                signal: abortController.signal,
                onToken: (token) => {
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
                    setToolHint(`Chiamata ${toolName}…`);
                },
                onConversationId: (id) => {
                    conversationIdRef.current = id;
                    setConversationId(id);
                },
                onDone: (fullText) => {
                    completed = true;
                    abortControllerRef.current = null;
                    setToolHint(null);
                    isStreamingRef.current = false;
                    setIsStreaming(false);

                    if (fullText !== '') {
                        setMessages((current) =>
                            current.map((entry) =>
                                entry.id === assistantMessageId
                                    ? {
                                          ...entry,
                                          content: fullText,
                                          isError: false,
                                      }
                                    : entry,
                            ),
                        );
                    }

                    reloadConversation(conversationIdRef.current);
                },
                onError: () => {
                    abortControllerRef.current = null;
                    isStreamingRef.current = false;
                    setIsStreaming(false);
                    setToolHint(null);
                },
            });

            return completed;
        } catch (error) {
            if (
                (error instanceof DOMException && error.name === 'AbortError') ||
                (error instanceof Error && error.name === 'AbortError')
            ) {
                abortControllerRef.current = null;
                isStreamingRef.current = false;
                setIsStreaming(false);
                setToolHint(null);

                return false;
            }

            abortControllerRef.current = null;
            isStreamingRef.current = false;
            setIsStreaming(false);
            setToolHint(null);

            const messageText =
                error instanceof Error
                    ? error.message
                    : 'Errore durante la risposta';

            markAssistantError(assistantMessageId, messageText);
            toast.error(messageText);

            return false;
        }
    };

    const handleSend = async () => {
        const message = composer.trim();

        if (!message || isStreamingRef.current) {
            return;
        }

        setComposer('');

        try {
            await runStream(message, {
                conversationIdForStream: conversationIdRef.current,
                baseMessages: messages,
            });
        } catch (error) {
            const messageText =
                error instanceof Error
                    ? error.message
                    : "Errore durante l'invio";
            toast.error(messageText);
        }
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
            toast.error('Nessun messaggio utente da rigenerare');

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
                await truncateAiConversationFrom(conversationId, userMessage.id);
            } catch {
                toast.error('Impossibile preparare la rigenerazione');

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
            toast.success('Messaggio reinviato');
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
            toast.error('Il messaggio non può essere vuoto');

            return;
        }

        if (isStreamingRef.current) {
            handleStop();
        }

        const messageIndex = messages.findIndex((entry) => entry.id === messageId);

        if (messageIndex < 0) {
            return;
        }

        const baseMessages = messages.slice(0, messageIndex);

        if (conversationId && isPersistedMessageId(messageId)) {
            try {
                await truncateAiConversationFrom(conversationId, messageId);
            } catch {
                toast.error('Impossibile modificare il messaggio');

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
            toast.error('Dettatura non supportata in questo browser');

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
            toast.error('Errore durante la dettatura');
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
            toast.error('Impossibile avviare la dettatura');
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Assistente" />

            <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
                <aside className="flex w-72 shrink-0 flex-col border-r">
                    <div className="flex items-center justify-between gap-2 border-b p-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Sparkles className="size-4 text-orange-500" />
                            Chat
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                size="icon"
                                variant="outline"
                                className="size-8"
                                disabled={selectedIds.size === 0 || isBulkDeleting}
                                onClick={() => setConfirmBulkDeleteOpen(true)}
                                aria-label="Elimina chat selezionate"
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleNewChat()}
                            >
                                <Plus className="size-4" />
                                Nuova
                            </Button>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {conversationItems.length === 0 ? (
                            <p className="px-2 py-4 text-sm text-muted-foreground">
                                Nessuna conversazione.
                            </p>
                        ) : (
                            <>
                                {conversationSections.map((section) => (
                                    <div key={section.key} className="mb-3">
                                        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                            {section.key === 'pinned' ? (
                                                <Pin className="size-3 fill-current" />
                                            ) : null}
                                            {section.label}
                                        </div>
                                        {section.conversations.map((conversation) => {
                                            const index =
                                                conversationIndexById.get(
                                                    conversation.id,
                                                ) ?? 0;

                                            return (
                                                <div
                                                    key={conversation.id}
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
                                                        onPointerDown={(event) =>
                                                            handleCheckboxPointerDown(
                                                                event,
                                                                index,
                                                            )
                                                        }
                                                        onCheckedChange={(checked) =>
                                                            toggleSelected(
                                                                conversation.id,
                                                                checked === true,
                                                                index,
                                                            )
                                                        }
                                                        aria-label={`Seleziona ${conversation.title}`}
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
                                                        {conversation.title}
                                                    </button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className={cn(
                                                            'size-8',
                                                            conversation.pinned_at
                                                                ? 'opacity-100'
                                                                : 'opacity-0 group-hover:opacity-100',
                                                        )}
                                                        onClick={() =>
                                                            void handleTogglePin(
                                                                conversation.id,
                                                            )
                                                        }
                                                        aria-label={
                                                            conversation.pinned_at
                                                                ? 'Rimuovi pin'
                                                                : 'Fissa chat'
                                                        }
                                                    >
                                                        <Pin
                                                            className={cn(
                                                                'size-3.5',
                                                                conversation.pinned_at &&
                                                                    'fill-current',
                                                            )}
                                                        />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="size-8 opacity-0 group-hover:opacity-100"
                                                        onClick={() =>
                                                            void handleDelete(
                                                                conversation.id,
                                                            )
                                                        }
                                                        aria-label="Elimina chat"
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                                {hasMoreConversations ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="mb-2 w-full text-muted-foreground"
                                        disabled={isLoadingMore}
                                        onClick={() =>
                                            void handleLoadMoreConversations()
                                        }
                                    >
                                        {isLoadingMore
                                            ? 'Caricamento…'
                                            : 'Carica altre'}
                                    </Button>
                                ) : null}
                            </>
                        )}
                    </div>
                </aside>

                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <h1 className="text-sm font-semibold">{selectedTitle}</h1>
                            <p className="text-xs text-muted-foreground">
                                Assistente con permessi per collezioni e file
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href={aiIndex.url()}>Nuova chat</Link>
                        </Button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                        {messages.length === 0 ? (
                            <div className="m-auto max-w-md text-center text-sm text-muted-foreground">
                                Chiedi all&apos;assistente di elencare collezioni,
                                creare elementi o gestire file. Le azioni distruttive
                                passano dai tool.
                            </div>
                        ) : (
                            messages.map((message) => {
                                const isUser = message.role === 'user';
                                const isEditing = editingMessageId === message.id;
                                const isEmptyAssistant =
                                    !isUser && message.content.trim() === '';
                                const showThinking =
                                    isEmptyAssistant && isStreaming && !message.isError;

                                return (
                                    <Message
                                        key={message.id}
                                        align={isUser ? 'end' : 'start'}
                                    >
                                        <MessageContent>
                                            <Bubble
                                                variant={
                                                    message.isError
                                                        ? 'destructive'
                                                        : isUser
                                                          ? 'default'
                                                          : 'muted'
                                                }
                                                align={isUser ? 'end' : 'start'}
                                            >
                                                <BubbleContent
                                                    className={cn(
                                                        !isUser && 'w-full max-w-full',
                                                    )}
                                                >
                                                    {isEditing ? (
                                                        <div className="flex min-w-[16rem] flex-col gap-2">
                                                            <textarea
                                                                value={editingDraft}
                                                                onChange={(event) =>
                                                                    setEditingDraft(
                                                                        event.target
                                                                            .value,
                                                                    )
                                                                }
                                                                rows={3}
                                                                className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            />
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={cancelEditing}
                                                                >
                                                                    Annulla
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        void handleResendEdited(
                                                                            message.id,
                                                                        )
                                                                    }
                                                                >
                                                                    Invia di nuovo
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : showThinking ? (
                                                        <ThinkingDots />
                                                    ) : isUser ? (
                                                        <div className="whitespace-pre-wrap">
                                                            {message.content}
                                                        </div>
                                                    ) : message.isError ? (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="whitespace-pre-wrap text-sm">
                                                                {message.content}
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="secondary"
                                                                className="w-fit"
                                                                disabled={isStreaming}
                                                                onClick={() =>
                                                                    void handleRegenerate(
                                                                        message.id,
                                                                        {
                                                                            asRetry: true,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                <RefreshCw className="size-3.5" />
                                                                Riprova
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <AssistantMarkdown
                                                            content={message.content}
                                                        />
                                                    )}
                                                </BubbleContent>
                                            </Bubble>

                                            {isUser && !isEditing ? (
                                                <MessageFooter className="opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                                                    <UserMessageActions
                                                        content={message.content}
                                                        disabled={isStreaming}
                                                        onEdit={() =>
                                                            startEditing(message)
                                                        }
                                                    />
                                                </MessageFooter>
                                            ) : null}

                                            {!isUser &&
                                            !isEmptyAssistant &&
                                            !message.isError ? (
                                                <MessageFooter className="opacity-60 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                                                    <AssistantMessageActions
                                                        content={message.content}
                                                        disabled={isStreaming}
                                                        onRegenerate={() =>
                                                            void handleRegenerate(
                                                                message.id,
                                                            )
                                                        }
                                                    />
                                                </MessageFooter>
                                            ) : null}
                                        </MessageContent>
                                    </Message>
                                );
                            })
                        )}

                        {toolHint ? (
                            <p className="text-xs text-muted-foreground">{toolHint}</p>
                        ) : null}
                        <div ref={bottomRef} />
                    </div>

                    <div className="border-t p-3">
                        <form
                            className="flex items-end gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void handleSend();
                            }}
                        >
                            <Input
                                value={composer}
                                onChange={(event) => setComposer(event.target.value)}
                                placeholder="Chiedi all'assistente…"
                                disabled={isStreaming}
                                className="min-h-10"
                            />
                            {speechSupported ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant={isListening ? 'default' : 'outline'}
                                            className="shrink-0"
                                            disabled={isStreaming}
                                            onClick={toggleVoiceInput}
                                            aria-label={
                                                isListening
                                                    ? 'Interrompi dettatura'
                                                    : 'Dettatura vocale'
                                            }
                                        >
                                            {isListening ? (
                                                <MicOff className="size-4" />
                                            ) : (
                                                <Mic className="size-4" />
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {isListening
                                            ? 'Interrompi dettatura'
                                            : 'Dettatura vocale'}
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="inline-flex">
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="outline"
                                                className="shrink-0"
                                                disabled
                                                aria-label="Dettatura non supportata"
                                            >
                                                <Mic className="size-4" />
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Dettatura non supportata in questo browser
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {isStreaming ? (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleStop}
                                >
                                    <Square className="size-3.5 fill-current" />
                                    Stop
                                </Button>
                            ) : (
                                <Button type="submit" disabled={!composer.trim()}>
                                    Invia
                                </Button>
                            )}
                        </form>
                    </div>
                </section>
            </div>

            <Dialog
                open={confirmBulkDeleteOpen}
                onOpenChange={setConfirmBulkDeleteOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminare le chat selezionate?</DialogTitle>
                        <DialogDescription>
                            Stai per eliminare {selectedIds.size} chat.
                            L&apos;azione non può essere annullata.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmBulkDeleteOpen(false)}
                            disabled={isBulkDeleting}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleBulkDelete()}
                            disabled={isBulkDeleting}
                        >
                            Elimina
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
