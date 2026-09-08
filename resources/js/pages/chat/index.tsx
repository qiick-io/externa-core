import { Head, router, usePage } from '@inertiajs/react';
import { Database, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatThreadRow } from '@/components/chat/chat-thread-row';
import { NewChatMenu } from '@/components/chat/new-chat-menu';
import { ItemChatDrawer } from '@/components/collections/item-chat-drawer';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useChatUnread } from '@/hooks/use-chat-unread';
import AppLayout from '@/layouts/app-layout';
import { applyChatUnread, fetchChatThreads } from '@/lib/chat-hub-api';
import type { ChatSummary } from '@/lib/chat-hub-api';
import { formatChatUnread } from '@/lib/format-chat-unread';
import { STRING_LIMITS } from '@/lib/string-limits';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat/store';
import { threadsCacheKey } from '@/stores/chat/types';
import type { BreadcrumbItem } from '@/types';
import type { CollectionFieldRow } from '@/types/collections';

type Props = {
    tab: 'collection' | 'private';
    q: string;
    selectedChat: ChatSummary | null;
    fields: CollectionFieldRow[];
    canCreateDirect: boolean;
};

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Chat',
        href: '/chat',
    },
];

const noopChatCountChange = (): void => undefined;

export default function ChatHubPage({
    tab: tabProp,
    q: qProp,
    selectedChat,
    fields,
    canCreateDirect,
}: Props) {
    const { t } = useTranslation();
    const page = usePage();
    const viewerId = page.props.auth.user?.id ?? 0;
    const unread = useChatUnread();
    const [tab, setTab] = useState<'collection' | 'private'>(tabProp);
    const [q, setQ] = useState(qProp);
    const [debouncedQ, setDebouncedQ] = useState(qProp);
    const selectedChatIdRef = useRef<string | null>(selectedChat?.id ?? null);

    const cacheKey = threadsCacheKey(tab, debouncedQ);
    const entry = useChatStore((state) => state.threadsByKey[cacheKey]);
    const setThreads = useChatStore((state) => state.setThreads);
    const setThreadsStatus = useChatStore((state) => state.setThreadsStatus);
    const patchThread = useChatStore((state) => state.patchThread);
    const setHubTab = useChatStore((state) => state.setTab);
    const setHubQuery = useChatStore((state) => state.setQuery);

    const threads = entry?.items ?? [];
    const threadsLoaded = entry?.status === 'ready';

    selectedChatIdRef.current = selectedChat?.id ?? null;

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedQ(q), 300);

        return () => window.clearTimeout(timer);
    }, [q]);

    const loadThreads = useCallback(
        (opts?: { soft?: boolean }): void => {
            const soft = opts?.soft === true;
            const current = useChatStore.getState().threadsByKey[cacheKey];

            if (!soft || current?.status !== 'ready') {
                setThreadsStatus(cacheKey, 'loading');
            }

            void fetchChatThreads({ tab, q: debouncedQ })
                .then((payload) => {
                    setThreads(cacheKey, payload.data);
                    applyChatUnread({
                        unread_count: payload.meta.unread_count,
                        unread_private: payload.meta.unread_private,
                        unread_collection: payload.meta.unread_collection,
                    });
                })
                .catch((error: unknown) => {
                    if (!soft || current?.status !== 'ready') {
                        setThreadsStatus(cacheKey, 'error');
                    }

                    toast.error(
                        error instanceof Error
                            ? error.message
                            : 'Could not load chats.',
                    );
                });
        },
        [tab, debouncedQ, cacheKey, setThreads, setThreadsStatus],
    );

    useEffect(() => {
        const cached = useChatStore.getState().threadsByKey[cacheKey];

        if (cached?.status === 'ready') {
            // Reuse short cache; soft-refresh in background.
            loadThreads({ soft: true });
        } else {
            loadThreads();
        }
    }, [loadThreads, cacheKey]);

    useEffect(() => {
        setTab(tabProp);
        setQ(qProp);
        setHubTab(tabProp);
        setHubQuery(qProp);
    }, [tabProp, qProp, setHubTab, setHubQuery]);

    useEffect(() => {
        const activeId = selectedChatIdRef.current;

        if (!activeId) {
            return;
        }

        // Keep open-thread row at zero unread when totals refresh from API/Echo.
        if (unread.unread_count >= 0) {
            patchThread(activeId, { unread_count: 0 });
        }
    }, [
        unread.unread_count,
        unread.unread_private,
        unread.unread_collection,
        patchThread,
    ]);

    const openThread = (id: string): void => {
        patchThread(id, { unread_count: 0 });

        router.get(
            `/chat/${id}`,
            {},
            {
                preserveState: true,
                preserveScroll: true,
                only: ['selectedChat', 'fields', 'tab', 'q'],
            },
        );
    };

    const switchTab = (next: 'collection' | 'private'): void => {
        setTab(next);
        setHubTab(next);
        router.visit(
            `/chat${selectedChat ? `/${selectedChat.id}` : ''}?tab=${next}`,
            {
                preserveState: true,
                preserveScroll: true,
            },
        );
    };

    const selectedKind = selectedChat?.kind ?? 'item';

    const fieldRows = useMemo(
        () =>
            fields.map((field) => ({
                ...field,
                type:
                    typeof field.type === 'string'
                        ? field.type
                        : String(field.type),
            })),
        [fields],
    );

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <NewChatMenu canCreateDirect={canCreateDirect} />
            }
        >
            <Head title={t('chatHub.title')} />
            <div
                data-test="chat-hub"
                className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card"
            >
                <aside className="flex w-80 shrink-0 flex-col border-r">
                    <div className="flex items-stretch border-b border-input">
                        <button
                            type="button"
                            data-test="chat-tab-collection"
                            className={cn(
                                'inline-flex flex-1 items-center justify-center gap-1.5 border-r border-input px-3 py-2 text-sm',
                                tab === 'collection'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground',
                            )}
                            onClick={() => switchTab('collection')}
                        >
                            <Database className="size-4" />
                            {t('chatHub.collection')}
                            {unread.unread_collection > 0 ? (
                                <span
                                    data-test="chat-tab-collection-unread"
                                    className={cn(
                                        'min-w-5 rounded-full px-1.5 text-[11px] font-medium',
                                        tab === 'collection'
                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                            : 'bg-primary text-primary-foreground',
                                    )}
                                >
                                    {formatChatUnread(unread.unread_collection)}
                                </span>
                            ) : null}
                        </button>
                        <button
                            type="button"
                            data-test="chat-tab-private"
                            className={cn(
                                'inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm',
                                tab === 'private'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground',
                            )}
                            onClick={() => switchTab('private')}
                        >
                            <UsersRound className="size-4" />
                            {t('chatHub.users')}
                            {unread.unread_private > 0 ? (
                                <span
                                    data-test="chat-tab-private-unread"
                                    className={cn(
                                        'min-w-5 rounded-full px-1.5 text-[11px] font-medium',
                                        tab === 'private'
                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                            : 'bg-primary text-primary-foreground',
                                    )}
                                >
                                    {formatChatUnread(unread.unread_private)}
                                </span>
                            ) : null}
                        </button>
                    </div>
                    <div className="border-b p-2">
                        <Input
                            data-test="chat-filter-q"
                            value={q}
                            placeholder={t('chatHub.search')}
                            maxLength={STRING_LIMITS.SEARCH_CHAT_HUB}
                            onChange={(event) => {
                                setQ(event.target.value);
                                setHubQuery(event.target.value);
                            }}
                        />
                    </div>
                    <div
                        data-test="chat-list"
                        className={cn(
                            'min-h-0 flex-1 overflow-y-auto p-2',
                            !threadsLoaded &&
                                'flex flex-col items-center justify-center',
                        )}
                    >
                        {!threadsLoaded ? (
                            <div
                                data-test="chat-list-loading"
                                className="flex flex-col items-center gap-2 text-sm text-muted-foreground"
                            >
                                <Spinner className="size-5" />
                                {t('chatHub.loading')}
                            </div>
                        ) : threads.length === 0 ? (
                            <p className="px-2 py-4 text-sm text-muted-foreground">
                                {t('chatHub.empty')}
                            </p>
                        ) : (
                            threads.map((thread) => (
                                <ChatThreadRow
                                    key={thread.id}
                                    thread={thread}
                                    selected={selectedChat?.id === thread.id}
                                    viewerId={viewerId}
                                    canCreateDirect={canCreateDirect}
                                    onOpen={openThread}
                                />
                            ))
                        )}
                    </div>
                </aside>
                <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <ItemChatDrawer
                        key="chat-hub-pane"
                        open={selectedChat !== null}
                        variant="pane"
                        chatId={selectedChat?.id ?? null}
                        kind={selectedKind}
                        collectionId={
                            selectedChat?.collection_id ?? undefined
                        }
                        itemId={
                            selectedChat?.collection_item_id ?? undefined
                        }
                        fields={fieldRows}
                        chatCount={0}
                        onChatCountChange={noopChatCountChange}
                        thread={selectedChat}
                        canCreateDirect={canCreateDirect}
                    />
                    {selectedChat === null ? (
                        <div className="absolute inset-0 flex flex-1 items-center justify-center bg-card text-sm text-muted-foreground">
                            {t('chatHub.pickThread')}
                        </div>
                    ) : null}
                </section>
            </div>
        </AppLayout>
    );
}
