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
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { AiActionPresetsDrawer } from '@/components/ai/ai-action-presets-drawer';
import { AiChatDropZone } from '@/components/ai/ai-chat-drop-zone';
import { AiChatMessages } from '@/components/ai/ai-chat-messages';
import { AiComposer } from '@/components/ai/ai-composer';
import { AiContextAttachDialog } from '@/components/ai/ai-context-attach-dialog';
import { ChatMessageScroller } from '@/components/chat/chat-message-scroller';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
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
import { useAiChat } from '@/hooks/use-ai-chat';
import type { AiChatMessage } from '@/hooks/use-ai-chat';
import AppLayout from '@/layouts/app-layout';
import {
    AI_CHAT_ATTACHMENT_ACCEPT,
    AI_CHAT_ATTACHMENT_MAX_COUNT,
    bulkDeleteAiConversations,
    createAiConversation,
    deleteAiConversation,
    fetchAiImportJobStatus,
    fetchAiConversationsPage,
    toggleAiConversationPin,
} from '@/lib/ai-chat';
import type { AiConversationSummary, AiImportJobStatus } from '@/lib/ai-chat';
import i18n from '@/lib/i18n';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { STRING_LIMITS } from '@/lib/string-limits';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { index as aiIndex, show as aiShow } from '@/routes/ai';
import type { Paginated } from '@/types/admin';

type ConversationSummary = AiConversationSummary;

type Props = {
    conversations:
        LaravelPaginated<ConversationSummary> | Paginated<ConversationSummary>;
    selectedConversation: ConversationSummary | null;
    messages: AiChatMessage[];
};

type ConversationSection = {
    key: string;
    label: string;
    conversations: ConversationSummary[];
};

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
    const { t } = useTranslation();
    const page = usePage();
    const initialPaginated = normalizePaginated(conversationsProp);
    const chat = useAiChat({
        initialConversationId: selectedConversation?.id ?? null,
        initialMessages,
        onTurnSettled: (resolvedConversationId) =>
            reloadConversation(resolvedConversationId),
        onToolResult: (_toolName, result) => {
            const jobId = importJobIdFromToolResult(result);

            if (jobId) {
                startImportPoll(jobId);
            }
        },
    });
    const { loadConversation } = chat;
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
    const [conversationIdPendingDelete, setConversationIdPendingDelete] =
        useState<string | null>(null);
    const [isDeletingConversation, setIsDeletingConversation] = useState(false);
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
    const [contextAttachOpen, setContextAttachOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [importJobStatus, setImportJobStatus] =
        useState<AiImportJobStatus | null>(null);

    const lastSelectedIndexRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const importPollTimeoutRef = useRef<number | null>(null);
    const importPollJobIdRef = useRef<string | null>(null);
    const importPollActiveRef = useRef(false);

    // Sync Inertia props when the selected conversation changes — never while streaming.
    useEffect(() => {
        loadConversation(initialMessages, selectedConversation?.id ?? null);
    }, [initialMessages, selectedConversation?.id, page.url, loadConversation]);

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
        chat.abortStream();

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
        setIsDeletingConversation(true);

        try {
            await deleteAiConversation(id);
            toast.success(t('ai.chatDeleted'));
            setConversationIdPendingDelete(null);
            removeConversationsFromSidebar([id]);
            refreshConversationsAfterDelete(chat.conversationId === id);
        } catch {
            toast.error(t('ai.unableDeleteChat'));
        } finally {
            setIsDeletingConversation(false);
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
                chat.conversationId !== null &&
                ids.includes(String(chat.conversationId));

            refreshConversationsAfterDelete(selectedWasDeleted);
        } catch {
            toast.error(t('ai.unableDeleteSelectedChats'));
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const reloadConversation = (resolvedConversationId: string | null) => {
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
                                                                    chat.conversationId
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
                                                                            setConversationIdPendingDelete(
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
                            disabled={
                                chat.isStreaming || chat.isUploadingAttachment
                            }
                            onFilesSelected={(files) =>
                                void chat.handleAttachmentFiles(files)
                            }
                        >
                            <ChatMessageScroller
                                empty={
                                    chat.messages.length === 0 ? (
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
                                    ) : null
                                }
                                autoScroll={!chat.isStreaming}
                                label={t('ai.conversationRegion')}
                                contentClassName="px-4 py-4"
                                // AiChatMessages announces finished answers itself.
                                contentProps={{ 'aria-live': 'off' }}
                            >
                                <AiChatMessages
                                    messages={chat.messages}
                                    isStreaming={chat.isStreaming}
                                    editingMessageId={chat.editingMessageId}
                                    editingDraft={chat.editingDraft}
                                    onEditingDraftChange={chat.setEditingDraft}
                                    onCancelEdit={chat.cancelEditing}
                                    onStartEdit={chat.startEditing}
                                    onResendEdited={(messageId) =>
                                        void chat.handleResendEdited(messageId)
                                    }
                                    onRegenerate={(messageId, options) =>
                                        void chat.handleRegenerate(
                                            messageId,
                                            options,
                                        )
                                    }
                                    onSuggestedAction={chat.setComposer}
                                    onResolveApprovals={(messageId, approved) =>
                                        void chat.handleResolveApprovals(
                                            messageId,
                                            approved,
                                        )
                                    }
                                />

                                {chat.toolHint ? (
                                    <p className="text-xs text-muted-foreground">
                                        {chat.toolHint}
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
                            </ChatMessageScroller>

                            <div className="border-t p-3">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={AI_CHAT_ATTACHMENT_ACCEPT}
                                    multiple
                                    className="hidden"
                                    onChange={(event) =>
                                        void chat.handleAttachmentSelected(
                                            event,
                                        )
                                    }
                                />
                                <AiComposer
                                    value={chat.composer}
                                    onChange={chat.setComposer}
                                    onSubmit={() => void chat.handleSend()}
                                    onStop={chat.handleStop}
                                    isStreaming={chat.isStreaming}
                                    attachments={chat.pendingAttachments}
                                    onRemoveAttachment={
                                        chat.removePendingAttachment
                                    }
                                    contextAttachments={
                                        chat.pendingContextAttachments
                                    }
                                    onRemoveContextAttachment={
                                        chat.removePendingContextAttachment
                                    }
                                    onAttach={() => setContextAttachOpen(true)}
                                    isUploadingAttachment={
                                        chat.isUploadingAttachment
                                    }
                                    attachDisabled={
                                        chat.pendingAttachments.length >=
                                        AI_CHAT_ATTACHMENT_MAX_COUNT
                                    }
                                    speechSupported={chat.speechSupported}
                                    isListening={chat.isListening}
                                    onToggleVoice={chat.toggleVoiceInput}
                                    dryRunMode={chat.dryRunMode}
                                    onDryRunModeChange={chat.setDryRunMode}
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
                onAttach={chat.addContextAttachments}
                onPickUploadFiles={() => {
                    setContextAttachOpen(false);
                    fileInputRef.current?.click();
                }}
            />

            <AiActionPresetsDrawer
                open={presetsOpen}
                onOpenChange={setPresetsOpen}
                onSelect={(prompt) => chat.setComposer(prompt)}
            />

            <ConfirmDestructiveDialog
                open={conversationIdPendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setConversationIdPendingDelete(null);
                    }
                }}
                title={t('confirmDestructive.deleteAiChatTitle')}
                description={t('confirmDestructive.deleteAiChatDescription')}
                confirming={isDeletingConversation}
                onConfirm={() => {
                    if (conversationIdPendingDelete !== null) {
                        void handleDelete(conversationIdPendingDelete);
                    }
                }}
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
