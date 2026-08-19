import { Link, router } from '@inertiajs/react';
import { MessageCircle, MoreVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatThreadAvatar } from '@/components/chat/chat-thread-avatar';
import {
    ChatUsersDrawer,
    directoryKey,
} from '@/components/chat/chat-users-drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
    addChatParticipants,
    deleteDirectChat,
} from '@/lib/chat-hub-api';
import type { ChatDirectoryRow } from '@/lib/chat-hub-api';
import type { ChatThreadIdentity } from '@/lib/chat-thread-identity';
import { otherUserFaces } from '@/lib/chat-thread-identity';
import { toast } from '@/lib/toast';

type Props = {
    thread: ChatThreadIdentity | null;
    kind: 'item' | 'direct';
    viewerId: number;
    variant: 'drawer' | 'pane';
    liveChatId: string | null;
    notify: boolean;
    onNotifyChange: (next: boolean) => void;
    canCreateDirect?: boolean;
};

export function ChatThreadHeader({
    thread,
    kind,
    viewerId,
    variant,
    liveChatId,
    notify,
    onNotifyChange,
    canCreateDirect = false,
}: Props) {
    const { t } = useTranslation();
    const [addPeopleOpen, setAddPeopleOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const subtitle = useMemo((): string | null => {
        if (kind === 'item') {
            return t('collections.itemChat.visibilityHint');
        }

        if (!thread) {
            return null;
        }

        const others = otherUserFaces(thread.participants, viewerId);
        if (others.length <= 1) {
            return null;
        }

        return others.map((face) => face.name).join(', ');
    }, [kind, t, thread, viewerId]);

    const excludeKeys = useMemo(
        () =>
            (thread?.participants ?? []).map((row) => directoryKey(row)),
        [thread?.participants],
    );

    const onAddPeople = async (picked: ChatDirectoryRow[]): Promise<void> => {
        if (!liveChatId) {
            return;
        }

        await addChatParticipants(liveChatId, {
            user_ids: picked
                .filter((row) => row.type === 'user')
                .map((row) => row.id),
            group_ids: picked
                .filter((row) => row.type === 'group')
                .map((row) => row.id),
        });

        if (variant === 'pane') {
            router.reload({ only: ['selectedChat'] });
        }
    };

    const onDeleteChat = (): void => {
        if (!liveChatId || deleting) {
            return;
        }

        setDeleting(true);
        void deleteDirectChat(liveChatId)
            .then(() => {
                router.visit('/chat');
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
            <div
                data-test="chat-thread-header"
                className="flex items-center gap-3 border-b px-4 py-2.5"
            >
                {thread ? (
                    <ChatThreadAvatar thread={thread} viewerId={viewerId} />
                ) : (
                    <MessageCircle className="size-10 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                    <div
                        data-test="chat-header-title"
                        className="truncate text-sm font-medium"
                    >
                        {thread?.title ?? t('collections.itemChat.title')}
                    </div>
                    {subtitle ? (
                        <div
                            data-test={
                                kind === 'item'
                                    ? 'chat-visibility-hint'
                                    : 'chat-header-subtitle'
                            }
                            className="mt-0.5 truncate text-xs text-muted-foreground"
                        >
                            {subtitle}
                        </div>
                    ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {variant === 'drawer' && liveChatId ? (
                        <Link
                            href={`/chat/${liveChatId}`}
                            data-test="chat-open-in-hub"
                            className="text-xs font-normal text-primary underline-offset-2 hover:underline"
                        >
                            {t('collections.itemChat.openInHub')}
                        </Link>
                    ) : null}
                    {kind === 'item' ? (
                        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                            <Checkbox
                                id="item-chat-notify"
                                checked={notify}
                                onCheckedChange={(value) =>
                                    onNotifyChange(value === true)
                                }
                            />
                            <Label
                                htmlFor="item-chat-notify"
                                className="text-xs font-normal leading-tight whitespace-nowrap"
                            >
                                {t('collections.itemChat.notify')}
                            </Label>
                        </div>
                    ) : liveChatId ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 shrink-0"
                                    data-test="chat-thread-menu"
                                    aria-label={t('collections.itemChat.more')}
                                >
                                    <MoreVertical className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
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
                    ) : null}
                </div>
            </div>
            {kind === 'direct' && canCreateDirect ? (
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
