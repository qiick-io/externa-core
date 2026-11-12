import { CircleAlert, Ellipsis } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessageScroller } from '@/components/chat/chat-message-scroller';
import type { ChatMessageScrollerHandle } from '@/components/chat/chat-message-scroller';
import { ChatOutgoingAttachPreview } from '@/components/chat/chat-outgoing-attach-preview';
import type { PendingChatMessage } from '@/components/chat/chat-outgoing-attach-preview';
import { ChatPinnedBar } from '@/components/chat/chat-pinned-bar';
import {
    dayLabel,
    renderMessageBody,
} from '@/components/collections/item-chat/item-chat-format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { MessageGroup } from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import type { ChatPinned, ItemChatMessage } from '@/lib/item-chat-api';

/** What the list hands to `renderMessage` for one message. */
type ItemChatMessageSlot = {
    comment: ItemChatMessage;
    isGroupStart: boolean;
    previousCreatedAt: string | null;
};

type ItemChatMessageListProps = {
    /** Remounts the scroller when the thread changes, so scroll state starts fresh. */
    scopeKey: string | null;
    scrollerRef: RefObject<ChatMessageScrollerHandle | null>;
    messages: ItemChatMessage[];
    pinned: ChatPinned[];
    pendingMessages: PendingChatMessage[];
    typingNames: string[];
    hasMore: boolean;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    onLoadOlder: () => void;
    onSelectMessage: (id: number) => void;
    onRetryPending: (clientId: string) => void;
    onRemovePendingFile: (clientId: string, fileKey: string) => void;
    renderMessage: (slot: ItemChatMessageSlot) => ReactNode;
};

/**
 * Scrollable message feed of the item chat: loading and typing overlay, "load older",
 * the error alert, the pinned bar, messages grouped by sender and day, and the
 * optimistic pending bubbles at the end.
 */
export function ItemChatMessageList({
    scopeKey,
    scrollerRef,
    messages,
    pinned,
    pendingMessages,
    typingNames,
    hasMore,
    loading,
    loadingMore,
    error,
    onLoadOlder,
    onSelectMessage,
    onRetryPending,
    onRemovePendingFile,
    renderMessage,
}: ItemChatMessageListProps) {
    const { t } = useTranslation();

    /**
     * Consecutive messages from one sender on one day form a group: the name
     * and avatar show once, on the first message.
     */
    const messageGroups = useMemo(() => {
        const groups: Array<{
            key: number;
            items: Array<{
                comment: ItemChatMessage;
                index: number;
                isGroupStart: boolean;
            }>;
        }> = [];

        messages.forEach((comment, index) => {
            const previous = messages[index - 1];
            const isGroupStart =
                !previous ||
                previous.user?.id !== comment.user?.id ||
                dayLabel(previous.created_at) !== dayLabel(comment.created_at);

            if (isGroupStart) {
                groups.push({ key: comment.id, items: [] });
            }

            groups[groups.length - 1]!.items.push({
                comment,
                index,
                isGroupStart,
            });
        });

        return groups;
    }, [messages]);

    const typingLabel = useMemo(() => {
        if (typingNames.length === 0) {
            return null;
        }

        if (typingNames.length === 1) {
            return t('collections.itemChat.typing.one', {
                name: typingNames[0],
            });
        }

        return t('collections.itemChat.typing.many', {
            name: typingNames[0],
            count: typingNames.length - 1,
        });
    }, [t, typingNames]);

    return (
        <ChatMessageScroller
            key={scopeKey ?? 'none'}
            scrollerRef={scrollerRef}
            empty={
                !loading && messages.length === 0 ? (
                    <p className="m-auto text-sm text-muted-foreground">
                        {t('collections.itemChat.empty')}
                    </p>
                ) : null
            }
            contentClassName="gap-3 px-6 pt-6 pb-8"
            overlay={
                loading || typingLabel ? (
                    <div className="flex flex-col items-center gap-1">
                        {loading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Spinner className="size-4" />
                                {t('collections.itemChat.loading')}
                            </div>
                        ) : null}
                        {typingLabel ? (
                            <Marker
                                role="status"
                                className="w-auto rounded-full bg-background/90 px-2 py-0.5 text-xs shadow-sm"
                            >
                                <MarkerIcon>
                                    <Ellipsis className="animate-pulse" />
                                </MarkerIcon>
                                <MarkerContent>{typingLabel}</MarkerContent>
                            </Marker>
                        ) : null}
                    </div>
                ) : null
            }
        >
            {hasMore ? (
                <Button
                    type="button"
                    variant="outline"
                    disabled={loading || loadingMore}
                    onClick={onLoadOlder}
                >
                    {loadingMore ? <Spinner /> : null}
                    {t('collections.itemChat.loadOlder')}
                </Button>
            ) : null}
            {error ? (
                <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}
            <ChatPinnedBar
                rows={pinned.map((row) => ({
                    id: row.id,
                    author: row.user?.name ?? '',
                    body:
                        row.body !== ''
                            ? renderMessageBody(
                                  row.body,
                                  row.mentioned_users ?? [],
                                  row.mentioned_collections ?? [],
                              )
                            : '',
                }))}
                onSelect={onSelectMessage}
            />
            {messageGroups.map((group) => (
                <MessageGroup
                    key={group.key}
                    data-test="chat-message-group"
                    className="gap-1"
                >
                    {group.items.map(({ comment, index, isGroupStart }) =>
                        renderMessage({
                            comment,
                            isGroupStart,
                            previousCreatedAt:
                                messages[index - 1]?.created_at ?? null,
                        }),
                    )}
                </MessageGroup>
            ))}
            {pendingMessages.map((pending) => (
                <ChatOutgoingAttachPreview
                    key={pending.clientId}
                    pending={pending}
                    renderBody={renderMessageBody}
                    onRetry={onRetryPending}
                    onRemoveFile={onRemovePendingFile}
                />
            ))}
        </ChatMessageScroller>
    );
}
