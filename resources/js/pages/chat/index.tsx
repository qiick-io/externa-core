import { Head, router, usePage } from '@inertiajs/react';
import {
    Archive,
    Database,
    Inbox,
    MessageSquare,
    MessagesSquare,
    Paperclip,
    Smile,
    UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatThreadRow } from '@/components/chat/chat-thread-row';
import { NewChatMenu } from '@/components/chat/new-chat-menu';
import { ItemChatDrawer } from '@/components/collections/item-chat-drawer';
import { FilterSearch } from '@/components/layout/page-header';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { DrawerFooter } from '@/components/ui/drawer';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
    const [showArchived, setShowArchived] = useState(false);
    const [q, setQ] = useState(qProp);
    const [debouncedQ, setDebouncedQ] = useState(qProp);
    const selectedChatIdRef = useRef<string | null>(selectedChat?.id ?? null);

    const cacheKey = threadsCacheKey(
        tab,
        debouncedQ,
        tab === 'private' && showArchived,
    );
    const entry = useChatStore((state) => state.threadsByKey[cacheKey]);
    const setThreads = useChatStore((state) => state.setThreads);
    const setThreadsStatus = useChatStore((state) => state.setThreadsStatus);
    const patchThread = useChatStore((state) => state.patchThread);
    const setHubTab = useChatStore((state) => state.setTab);
    const setHubQuery = useChatStore((state) => state.setQuery);

    const threads = entry?.items ?? [];
    const threadsLoaded = entry?.status === 'ready';

    useEffect(() => {
        selectedChatIdRef.current = selectedChat?.id ?? null;
    }, [selectedChat?.id]);

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

            void fetchChatThreads({
                tab,
                q: debouncedQ,
                archived: tab === 'private' && showArchived,
            })
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
        [tab, debouncedQ, showArchived, cacheKey, setThreads, setThreadsStatus],
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

        if (next !== 'private') {
            setShowArchived(false);
        }

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
            headerActions={<NewChatMenu canCreateDirect={canCreateDirect} />}
        >
            <Head title={t('chatHub.title')} />
            <PageLayout
                filters={
                    <FilterSearch
                        dataTest="chat-filter-q"
                        className="w-64 flex-none sm:max-w-none lg:w-80"
                        value={q}
                        placeholder={t('chatHub.search')}
                        maxLength={STRING_LIMITS.SEARCH_CHAT_HUB}
                        onChange={(value) => {
                            setQ(value);
                            setHubQuery(value);
                        }}
                    />
                }
                filtersRight={
                    <>
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            value={tab}
                            onValueChange={(value) => {
                                if (
                                    value === 'collection' ||
                                    value === 'private'
                                ) {
                                    switchTab(value);
                                }
                            }}
                        >
                            <ToggleGroupItem
                                value="collection"
                                data-test="chat-tab-collection"
                            >
                                <Database className="size-4" />
                                <span>{t('chatHub.collection')}</span>
                                {unread.unread_collection > 0 ? (
                                    <span
                                        data-test="chat-tab-collection-unread"
                                        className="min-w-5 rounded-full bg-primary px-2 text-xs font-medium text-primary-foreground"
                                    >
                                        {formatChatUnread(
                                            unread.unread_collection,
                                        )}
                                    </span>
                                ) : null}
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                value="private"
                                data-test="chat-tab-private"
                            >
                                <UsersRound className="size-4" />
                                <span>{t('chatHub.users')}</span>
                                {unread.unread_private > 0 ? (
                                    <span
                                        data-test="chat-tab-private-unread"
                                        className="min-w-5 rounded-full bg-primary px-2 text-xs font-medium text-primary-foreground"
                                    >
                                        {formatChatUnread(
                                            unread.unread_private,
                                        )}
                                    </span>
                                ) : null}
                            </ToggleGroupItem>
                        </ToggleGroup>
                        <HeaderIconButton
                            type="button"
                            data-test="chat-filter-archived"
                            disabled={tab !== 'private'}
                            variant={
                                tab === 'private' && showArchived
                                    ? 'default'
                                    : 'outline'
                            }
                            label={
                                showArchived
                                    ? t('chatHub.showInbox')
                                    : t('chatHub.showArchived')
                            }
                            onClick={() => setShowArchived((prev) => !prev)}
                        >
                            {tab === 'private' && showArchived ? (
                                <Inbox className="size-4" />
                            ) : (
                                <Archive className="size-4" />
                            )}
                        </HeaderIconButton>
                    </>
                }
            >
                <div
                    data-test="chat-hub"
                    className="flex min-h-0 flex-1 overflow-hidden"
                >
                    <aside
                        aria-label={t('a11y.chatThreadList')}
                        className="flex w-64 shrink-0 flex-col border-r lg:w-80"
                    >
                        <div
                            data-test="chat-list"
                            className={cn(
                                'min-h-0 flex-1 overflow-y-auto p-2',
                                (!threadsLoaded || threads.length === 0) &&
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
                                <Empty
                                    data-test="chat-list-empty"
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
                                            {t('chatHub.empty')}
                                        </EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : (
                                threads.map((thread) => (
                                    <ChatThreadRow
                                        key={thread.id}
                                        thread={thread}
                                        selected={
                                            selectedChat?.id === thread.id
                                        }
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
                            <div className="absolute inset-0 flex flex-col bg-background">
                                <Empty
                                    data-test="chat-pane-empty"
                                    className="min-h-0 flex-1"
                                >
                                    <EmptyHeader>
                                        <EmptyMedia
                                            variant="icon"
                                            className="bg-primary/10 text-primary"
                                        >
                                            <MessageSquare />
                                        </EmptyMedia>
                                        <EmptyDescription>
                                            {t('chatHub.pickThread')}
                                        </EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                                {/* Same composer frame as an open thread, disabled until one is picked. */}
                                <DrawerFooter
                                    data-test="chat-composer-placeholder"
                                    className="p-3"
                                >
                                    <ChatComposer
                                        disabled
                                        value=""
                                        onValueChange={() => undefined}
                                        onSubmit={() => undefined}
                                        canSubmit={false}
                                        placeholder={t(
                                            'collections.itemChat.placeholder',
                                        )}
                                        label={t(
                                            'collections.itemChat.placeholder',
                                        )}
                                        sendLabel={t(
                                            'collections.itemChat.send',
                                        )}
                                        actions={
                                            <>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    disabled
                                                    aria-label={t(
                                                        'collections.itemChat.emoji',
                                                    )}
                                                >
                                                    <Smile className="size-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    disabled
                                                    aria-label={t(
                                                        'collections.itemChat.attach',
                                                    )}
                                                >
                                                    <Paperclip className="size-4" />
                                                </Button>
                                            </>
                                        }
                                    />
                                </DrawerFooter>
                            </div>
                        ) : null}
                    </section>
                </div>
            </PageLayout>
        </AppLayout>
    );
}
