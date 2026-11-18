import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { AiActionPresetsDrawer } from '@/components/ai/ai-action-presets-drawer';
import { AiContextAttachDialog } from '@/components/ai/ai-context-attach-dialog';
import { conversationUrl } from '@/components/ai/hub/ai-conversation-groups';
import { AiConversationList } from '@/components/ai/hub/ai-conversation-list';
import { AiConversationThread } from '@/components/ai/hub/ai-conversation-thread';
import { useAiConversationList } from '@/components/ai/hub/use-ai-conversation-list';
import type { AiConversationsProp } from '@/components/ai/hub/use-ai-conversation-list';
import {
    importJobIdFromToolResult,
    useAiImportJobPoll,
} from '@/components/ai/hub/use-ai-import-job-poll';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { ChatLayout } from '@/components/layout/chat-layout';
import { FilterSearch } from '@/components/layout/page-header';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useAiChat } from '@/hooks/use-ai-chat';
import type { AiChatMessage } from '@/hooks/use-ai-chat';
import AppLayout from '@/layouts/app-layout';
import {
    bulkDeleteAiConversations,
    createAiConversation,
    deleteAiConversation,
    toggleAiConversationPin,
} from '@/lib/ai-chat';
import type { AiConversationSummary } from '@/lib/ai-chat';
import { STRING_LIMITS } from '@/lib/string-limits';
import { toast } from '@/lib/toast';
import { index as aiIndex } from '@/routes/ai';

type Props = {
    conversations: AiConversationsProp;
    selectedConversation: AiConversationSummary | null;
    messages: AiChatMessage[];
};

/**
 * Full-page AI assistant chat interface. The sidebar state lives in
 * useAiConversationList, the chat session in the shared useAiChat (also used
 * by the floating assistant panel), and the import job marker in
 * useAiImportJobPoll; this page wires them to navigation and delete flows.
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
    const { importJobStatus, startImportPoll } = useAiImportJobPoll();
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
    const conversationList = useAiConversationList(conversationsProp);
    const { selectedIds, removeConversationsFromSidebar } = conversationList;
    const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
    const [conversationIdPendingDelete, setConversationIdPendingDelete] =
        useState<string | null>(null);
    const [isDeletingConversation, setIsDeletingConversation] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [contextAttachOpen, setContextAttachOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Sync Inertia props when the selected conversation changes — never while streaming.
    useEffect(() => {
        loadConversation(initialMessages, selectedConversation?.id ?? null);
    }, [initialMessages, selectedConversation?.id, page.url, loadConversation]);

    const selectConversation = (id: string) => {
        chat.abortStream();

        router.get(
            conversationUrl(id),
            {},
            { preserveState: false, preserveScroll: true },
        );
    };

    // Below `md` the list and the open conversation take turns, full width.
    const conversationOpen =
        selectedConversation !== null || chat.conversationId !== null;

    const closeConversation = () => {
        chat.abortStream();

        router.get(aiIndex.url(), {}, { preserveState: false });
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
                        className="sm:max-w-none md:w-64 md:flex-none lg:w-80"
                        value={conversationList.conversationQuery}
                        placeholder={t('ai.searchConversations')}
                        maxLength={STRING_LIMITS.SEARCH_CHAT_HUB}
                        onChange={conversationList.setConversationQuery}
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
                <ChatLayout
                    data-test="ai-hub"
                    listLabel={t('ai.conversations')}
                    isThreadOpen={conversationOpen}
                    isListCentered={
                        conversationList.conversationItems.length === 0
                    }
                    listColumnProps={{ 'data-test': 'ai-list-column' }}
                    listProps={{ 'data-test': 'ai-list' }}
                    threadProps={{ 'data-test': 'ai-thread-column' }}
                    list={
                        <AiConversationList
                            list={conversationList}
                            activeConversationId={chat.conversationId}
                            onOpenConversation={selectConversation}
                            onTogglePin={(id) => void handleTogglePin(id)}
                            onRequestDelete={setConversationIdPendingDelete}
                        />
                    }
                >
                    <AiConversationThread
                        chat={chat}
                        title={selectedConversation?.title ?? null}
                        importJobStatus={importJobStatus}
                        fileInputRef={fileInputRef}
                        onBack={closeConversation}
                        onOpenContextAttach={() => setContextAttachOpen(true)}
                        onOpenPresets={() => setPresetsOpen(true)}
                    />
                </ChatLayout>
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
                        <DialogTitle>{t('ai.bulkDeleteTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('ai.bulkDeleteDescription', {
                                count: selectedIds.size,
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmBulkDeleteOpen(false)}
                            disabled={isBulkDeleting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleBulkDelete()}
                            disabled={isBulkDeleting}
                        >
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
