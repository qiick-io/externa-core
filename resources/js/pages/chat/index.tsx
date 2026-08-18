import { Head, router, usePage } from '@inertiajs/react';
import { Database, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatThreadRow } from '@/components/chat/chat-thread-row';
import { NewChatMenu } from '@/components/chat/new-chat-menu';
import { ItemChatDrawer } from '@/components/collections/item-chat-drawer';
import { Input } from '@/components/ui/input';
import { useChatUnread } from '@/hooks/use-chat-unread';
import AppLayout from '@/layouts/app-layout';
import {
    CHAT_UNREAD_UPDATED_EVENT,
    fetchChatThreads,
} from '@/lib/chat-hub-api';
import type { ChatSummary } from '@/lib/chat-hub-api';
import { formatChatUnread } from '@/lib/format-chat-unread';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
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
    const [threads, setThreads] = useState<ChatSummary[]>([]);

    const loadThreads = useCallback((): void => {
        void fetchChatThreads({ tab, q })
            .then((payload) => setThreads(payload.data))
            .catch((error: unknown) => {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'Could not load chats.',
                );
            });
    }, [tab, q]);

    useEffect(() => {
        loadThreads();
    }, [loadThreads]);

    useEffect(() => {
        const onUnread = (): void => {
            loadThreads();
        };

        window.addEventListener(CHAT_UNREAD_UPDATED_EVENT, onUnread);

        return () => {
            window.removeEventListener(CHAT_UNREAD_UPDATED_EVENT, onUnread);
        };
    }, [loadThreads]);

    useEffect(() => {
        setTab(tabProp);
        setQ(qProp);
    }, [tabProp, qProp]);

    const openThread = (id: string): void => {
        router.visit(`/chat/${id}`);
    };

    const switchTab = (next: 'collection' | 'private'): void => {
        setTab(next);
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
                            {t('chatHub.private')}
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
                            onChange={(event) => setQ(event.target.value)}
                        />
                    </div>
                    <div
                        data-test="chat-list"
                        className="min-h-0 flex-1 overflow-y-auto p-2"
                    >
                        {threads.length === 0 ? (
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
                                    onOpen={openThread}
                                />
                            ))
                        )}
                    </div>
                </aside>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {selectedChat ? (
                        <ItemChatDrawer
                            open
                            variant="pane"
                            chatId={selectedChat.id}
                            kind={selectedKind}
                            collectionId={
                                selectedChat.collection_id ?? undefined
                            }
                            itemId={
                                selectedChat.collection_item_id ?? undefined
                            }
                            fields={fieldRows}
                            chatCount={0}
                            onChatCountChange={() => undefined}
                            thread={selectedChat}
                        />
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                            {t('chatHub.pickThread')}
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}
