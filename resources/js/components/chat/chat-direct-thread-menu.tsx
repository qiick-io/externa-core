import { router } from '@inertiajs/react';
import { MoreVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ChatUsersDrawer,
    directoryKey,
} from '@/components/chat/chat-users-drawer';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    addChatParticipants,
    archiveDirectChat,
    deleteDirectChat,
    unarchiveDirectChat,
} from '@/lib/chat-hub-api';
import type { ChatDirectoryRow, ChatSummary } from '@/lib/chat-hub-api';
import type { ChatParticipantRef } from '@/lib/chat-thread-identity';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat/store';

type Props = {
    chatId: string;
    participants: ChatParticipantRef[];
    canCreateDirect: boolean;
    archived?: boolean;
    /** Leave hub thread view after delete (open chat removed). */
    navigateHomeOnDelete?: boolean;
    /** Refresh Inertia selectedChat after add-people (pane header). */
    reloadSelectedOnAdd?: boolean;
    triggerClassName?: string;
    align?: 'start' | 'end';
};

/**
 * Direct-thread overflow: Add people (if can-create) + Archive/Unarchive + Delete.
 * Shared by hub list rows and thread header.
 */
export function ChatDirectThreadMenu({
    chatId,
    participants,
    canCreateDirect,
    archived = false,
    navigateHomeOnDelete = false,
    reloadSelectedOnAdd = false,
    triggerClassName,
    align = 'end',
}: Props) {
    const { t } = useTranslation();
    const upsertThread = useChatStore((state) => state.upsertThread);
    const [addPeopleOpen, setAddPeopleOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const excludeKeys = useMemo(
        () => participants.map((row) => directoryKey(row)),
        [participants],
    );

    const onAddPeople = async (picked: ChatDirectoryRow[]): Promise<void> => {
        const chat = await addChatParticipants(chatId, {
            user_ids: picked
                .filter((row) => row.type === 'user')
                .map((row) => row.id),
            group_ids: picked
                .filter((row) => row.type === 'group')
                .map((row) => row.id),
        });

        upsertThread(chat as ChatSummary);

        if (reloadSelectedOnAdd) {
            router.reload({ only: ['selectedChat'] });
        }
    };

    const runMuted = (action: () => Promise<void>, errorKey: string): void => {
        if (busy) {
            return;
        }

        setBusy(true);
        void action()
            .catch((error: unknown) => {
                toast.error(
                    error instanceof Error ? error.message : t(errorKey),
                );
            })
            .finally(() => setBusy(false));
    };

    const onArchive = (): void => {
        runMuted(async () => {
            await archiveDirectChat(chatId);

            if (navigateHomeOnDelete) {
                router.visit('/chat?tab=private');
            }
        }, 'chatHub.archiveChatError');
    };

    const onUnarchive = (): void => {
        runMuted(async () => {
            await unarchiveDirectChat(chatId);

            if (reloadSelectedOnAdd) {
                router.reload({ only: ['selectedChat'] });
            }
        }, 'chatHub.unarchiveChatError');
    };

    const onDeleteChat = (): void => {
        runMuted(async () => {
            await deleteDirectChat(chatId);

            if (navigateHomeOnDelete) {
                router.visit('/chat');
            }
        }, 'chatHub.deleteChatError');
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn('size-8 shrink-0', triggerClassName)}
                        data-test="chat-thread-menu"
                        aria-label={t('collections.itemChat.more')}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                    >
                        <MoreVertical className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align={align}
                    onClick={(event) => event.stopPropagation()}
                >
                    {canCreateDirect ? (
                        <DropdownMenuItem
                            data-test="chat-add-people"
                            onSelect={() => setAddPeopleOpen(true)}
                        >
                            {t('chatHub.addPeople')}
                        </DropdownMenuItem>
                    ) : null}
                    {archived ? (
                        <DropdownMenuItem
                            data-test="chat-unarchive"
                            disabled={busy}
                            onSelect={onUnarchive}
                        >
                            {t('chatHub.unarchiveChat')}
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            data-test="chat-archive"
                            disabled={busy}
                            onSelect={onArchive}
                        >
                            {t('chatHub.archiveChat')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        data-test="chat-delete"
                        variant="destructive"
                        disabled={busy}
                        onSelect={onDeleteChat}
                    >
                        {t('chatHub.deleteChat')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {canCreateDirect ? (
                <ChatUsersDrawer
                    open={addPeopleOpen}
                    onOpenChange={setAddPeopleOpen}
                    excludeKeys={excludeKeys}
                    title={t('chatHub.addPeople')}
                    confirmLabel={t('chatHub.addPeopleConfirm')}
                    onConfirm={onAddPeople}
                />
            ) : null}
        </>
    );
}
