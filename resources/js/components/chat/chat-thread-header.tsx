import { Link } from '@inertiajs/react';
import { MessageCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatDirectThreadMenu } from '@/components/chat/chat-direct-thread-menu';
import { ChatThreadAvatar } from '@/components/chat/chat-thread-avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ChatThreadIdentity } from '@/lib/chat-thread-identity';
import { otherUserFaces } from '@/lib/chat-thread-identity';

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

    return (
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
                            className="text-xs leading-tight font-normal whitespace-nowrap"
                        >
                            {t('collections.itemChat.notify')}
                        </Label>
                    </div>
                ) : liveChatId && thread ? (
                    <ChatDirectThreadMenu
                        chatId={liveChatId}
                        participants={thread.participants}
                        canCreateDirect={canCreateDirect}
                        archived={thread.archived === true}
                        navigateHomeOnDelete
                        reloadSelectedOnAdd={variant === 'pane'}
                    />
                ) : null}
            </div>
        </div>
    );
}
