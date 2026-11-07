import { Link } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { ChatDirectThreadMenu } from '@/components/chat/chat-direct-thread-menu';
import { ChatThreadAvatar } from '@/components/chat/chat-thread-avatar';
import { Badge } from '@/components/ui/badge';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import type { ChatSummary } from '@/lib/chat-hub-api';
import { formatChatUnread } from '@/lib/format-chat-unread';
import { cn } from '@/lib/utils';

type Props = {
    thread: ChatSummary;
    selected: boolean;
    viewerId: number;
    canCreateDirect: boolean;
    onOpen: (id: string) => void;
};

function formatThreadTime(iso: string | null, locale: string): string {
    if (!iso) {
        return '';
    }

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (sameDay) {
        return date.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }

    return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
    });
}

/**
 * Telegram-style chat hub row: avatar, title+preview, time+unread+menu.
 */
export function ChatThreadRow({
    thread,
    selected,
    viewerId,
    canCreateDirect,
    onOpen,
}: Props) {
    const { t, i18n } = useTranslation();
    const unread = thread.unread_count ?? 0;
    const badge = formatChatUnread(unread);
    const preview = thread.last_message?.body?.trim() || '';
    const imageId = thread.last_message?.image_attachment_id;
    const time = formatThreadTime(
        thread.last_message?.created_at ?? thread.updated_at,
        i18n.language,
    );
    const isDirect = thread.kind === 'direct';

    return (
        <Item
            asChild
            size="sm"
            variant={selected ? 'muted' : 'default'}
            className={cn(
                'mb-0.5 flex-nowrap gap-3 px-2 py-2 hover:bg-muted',
                selected && 'bg-muted',
            )}
        >
            <Link
                href={`/chat/${thread.id}`}
                data-test="chat-thread-row"
                data-unread={unread}
                aria-current={selected ? 'page' : undefined}
                onClick={(event) => {
                    event.preventDefault();
                    onOpen(thread.id);
                }}
            >
                <ItemMedia>
                    <ChatThreadAvatar thread={thread} viewerId={viewerId} />
                </ItemMedia>
                <ItemContent className="min-w-0 gap-0.5">
                    <ItemTitle className="w-full truncate">
                        <span className="truncate">{thread.title}</span>
                    </ItemTitle>
                    <ItemDescription className="flex min-w-0 items-center gap-2 text-xs">
                        {imageId ? (
                            <img
                                src={`/chat/${thread.id}/attachments/${imageId}`}
                                alt=""
                                className="size-4 shrink-0 rounded-sm object-cover"
                            />
                        ) : null}
                        <span className="truncate">
                            {preview || (imageId ? t('chatHub.photo') : '')}
                        </span>
                    </ItemDescription>
                </ItemContent>
                <ItemActions className="shrink-0 gap-0.5 self-start pt-0.5">
                    <div className="flex flex-col items-end gap-1">
                        {time ? (
                            <span className="text-xs text-muted-foreground">
                                {time}
                            </span>
                        ) : null}
                        {badge ? (
                            <Badge
                                className="min-w-5 rounded-full px-1.5 tabular-nums"
                                aria-label={t('chatHub.unreadCount', {
                                    count: unread,
                                })}
                            >
                                {badge}
                            </Badge>
                        ) : null}
                    </div>
                    {isDirect ? (
                        <ChatDirectThreadMenu
                            chatId={thread.id}
                            participants={thread.participants}
                            canCreateDirect={canCreateDirect}
                            archived={thread.archived === true}
                            navigateHomeOnDelete={selected}
                            reloadSelectedOnAdd={selected}
                            triggerClassName="size-7"
                        />
                    ) : null}
                </ItemActions>
            </Link>
        </Item>
    );
}
