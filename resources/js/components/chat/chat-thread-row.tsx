import { Link } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { ChatDirectThreadMenu } from '@/components/chat/chat-direct-thread-menu';
import { ChatThreadAvatar } from '@/components/chat/chat-thread-avatar';
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
        <Link
            href={`/chat/${thread.id}`}
            data-test="chat-thread-row"
            data-unread={unread}
            className={cn(
                'mb-0.5 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted',
                selected && 'bg-muted',
            )}
            onClick={(event) => {
                event.preventDefault();
                onOpen(thread.id);
            }}
        >
            <ChatThreadAvatar thread={thread} viewerId={viewerId} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                    {thread.title}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
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
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 self-start pt-0.5">
                <div className="flex flex-col items-end gap-1">
                    {time ? (
                        <span className="text-[11px] text-muted-foreground">
                            {time}
                        </span>
                    ) : null}
                    {badge ? (
                        <span
                            className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground"
                            aria-label={t('chatHub.unreadCount', {
                                count: unread,
                            })}
                        >
                            {badge}
                        </span>
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
            </div>
        </Link>
    );
}
