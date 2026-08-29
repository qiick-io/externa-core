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
    deleteDirectChat,
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
    /** Leave hub thread view after delete (open chat removed). */
    navigateHomeOnDelete?: boolean;
    /** Refresh Inertia selectedChat after add-people (pane header). */
    reloadSelectedOnAdd?: boolean;
    triggerClassName?: string;
    align?: 'start' | 'end';
};

/**
 * Direct-thread overflow: Add people (if can-create) + Delete.
 * Shared by hub list rows and thread header.
 */
export function ChatDirectThreadMenu({
    chatId,
    participants,
    canCreateDirect,
    navigateHomeOnDelete = false,
    reloadSelectedOnAdd = false,
    triggerClassName,
    align = 'end',
}: Props) {
    const { t } = useTranslation();
    const upsertThread = useChatStore((state) => state.upsertThread);
    const [addPeopleOpen, setAddPeopleOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

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

    const onDeleteChat = (): void => {
        if (deleting) {
            return;
        }

        setDeleting(true);
        void deleteDirectChat(chatId)
            .then(() => {
                if (navigateHomeOnDelete) {
                    router.visit('/chat');
                }
            })
            .catch((error: unknown) => {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('chatHub.deleteChatError'),
                );
            })
            .finally(() => setDeleting(false));
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
                    <DropdownMenuItem
                        data-test="chat-delete"
                        variant="destructive"
                        disabled={deleting}
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
