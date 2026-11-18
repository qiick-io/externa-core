import { Pin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatAttachmentFile } from '@/components/chat/chat-attachment-file';
import {
    ChatMessageActionsButton,
    ChatMessageContextMenu,
} from '@/components/chat/chat-message-actions-menu';
import type { ChatMessageActions } from '@/components/chat/chat-message-actions-menu';
import { ChatMessageReactions } from '@/components/chat/chat-message-reactions';
import { ChatReplyQuote } from '@/components/chat/chat-reply-quote';
import {
    commentTime,
    dayLabel,
    isChatMediaAttachment,
    renderMessageBody,
} from '@/components/collections/item-chat/item-chat-format';
import { ChatMediaGallery } from '@/components/collections/item-chat/item-chat-media-gallery';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent } from '@/components/ui/marker';
import {
    Message,
    MessageAvatar,
    MessageContent,
    MessageHeader,
} from '@/components/ui/message';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { Textarea } from '@/components/ui/textarea';
import { UserHoverCard } from '@/components/user-hover-card';
import { avatarToneClass } from '@/lib/avatar-tone';
import { initialsFromName } from '@/lib/format';
import type {
    ChatAttachment,
    ChatScope,
    ItemChatMessage,
} from '@/lib/item-chat-api';
import { cn } from '@/lib/utils';

type ItemChatMessageItemProps = {
    comment: ItemChatMessage;
    /** First message of a sender's run on one day: shows the avatar and name. */
    isGroupStart: boolean;
    /** Timestamp of the message above, to decide whether a day separator shows. */
    previousCreatedAt: string | null;
    viewerId: number;
    scope: ChatScope | null;
    canCreateFiles: boolean;
    hasFileFields: boolean;
    actions: ChatMessageActions;
    isEditing: boolean;
    editingDraft: string;
    onEditingDraftChange: (value: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onAttachmentSaved: (attachment: ChatAttachment) => void;
    onAddToField: (attachment: ChatAttachment) => void;
    onSelectMessage: (id: number) => void;
    onReact: (emoji: string) => void;
};

/**
 * One message of the item chat: day separator, avatar and name at the start of a
 * group, the bubble (reply quote, media, body or inline editor, files, pin and time),
 * reactions and the message actions menus.
 */
export function ItemChatMessageItem({
    comment,
    isGroupStart,
    previousCreatedAt,
    viewerId,
    scope,
    canCreateFiles,
    hasFileFields,
    actions,
    isEditing,
    editingDraft,
    onEditingDraftChange,
    onSaveEdit,
    onCancelEdit,
    onAttachmentSaved,
    onAddToField,
    onSelectMessage,
    onReact,
}: ItemChatMessageItemProps) {
    const { t } = useTranslation();
    const userId = comment.user?.id ?? 0;
    const mine = comment.user?.id === viewerId;
    const prevDay = dayLabel(previousCreatedAt);
    const thisDay = dayLabel(comment.created_at);
    const showDay = thisDay !== '' && thisDay !== prevDay;
    const mediaAttachments = comment.attachments.filter(isChatMediaAttachment);
    const fileAttachments = comment.attachments.filter(
        (attachment) => !isChatMediaAttachment(attachment),
    );
    const hasMedia = mediaAttachments.length > 0;
    const pad = hasMedia ? 'px-3' : undefined;

    return (
        <MessageScrollerItem messageId={String(comment.id)}>
            {showDay ? (
                <Marker
                    variant="separator"
                    role="separator"
                    aria-label={thisDay}
                    className="mb-2 text-xs"
                >
                    <MarkerContent>{thisDay}</MarkerContent>
                </Marker>
            ) : null}
            <div className="flex items-start gap-2">
                <Message align={mine ? 'end' : 'start'}>
                    {!mine ? (
                        isGroupStart ? (
                            <MessageAvatar className="self-start bg-transparent">
                                <Avatar>
                                    {comment.user?.avatar ? (
                                        <AvatarImage
                                            src={comment.user.avatar}
                                            alt=""
                                        />
                                    ) : null}
                                    <AvatarFallback
                                        className={cn(
                                            avatarToneClass(userId),
                                            'text-xs font-medium',
                                        )}
                                    >
                                        {initialsFromName(
                                            comment.user?.name ?? '?',
                                        )}
                                    </AvatarFallback>
                                </Avatar>
                            </MessageAvatar>
                        ) : (
                            // Keeps grouped bubbles aligned under the first one.
                            <div className="w-8 shrink-0" aria-hidden />
                        )
                    ) : null}
                    <MessageContent>
                        {!mine && isGroupStart ? (
                            <MessageHeader className="font-medium text-foreground">
                                {comment.user ? (
                                    <UserHoverCard user={comment.user}>
                                        <button
                                            type="button"
                                            className="cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            data-test="chat-author-name"
                                        >
                                            {comment.user.name}
                                        </button>
                                    </UserHoverCard>
                                ) : null}
                            </MessageHeader>
                        ) : null}
                        <div className="flex min-w-0 items-end gap-1 group-data-[align=end]/message:flex-row-reverse">
                            <ChatMessageContextMenu actions={actions}>
                                <Bubble
                                    variant="muted"
                                    align={mine ? 'end' : 'start'}
                                    className={cn(
                                        // BubbleReactions overhang the bubble's bottom edge
                                        // by 3/4 of the 24px pill plus its 3px ring (21px).
                                        // Scroller items use content-visibility:auto, which
                                        // clips paint to the item box, so reserve 24px.
                                        comment.reactions.length > 0 && 'mb-6',
                                    )}
                                >
                                    <BubbleContent
                                        className={cn(
                                            'flex w-full flex-col gap-1',
                                            mine && 'text-foreground',
                                            // With media the bubble takes the album's
                                            // width (w-80): media edge to edge, the
                                            // caption wraps inside that width.
                                            hasMedia
                                                ? 'w-80 max-w-full gap-0 p-0'
                                                : 'min-w-0',
                                        )}
                                    >
                                        {comment.reply_to ? (
                                            <div
                                                className={cn(
                                                    'flex flex-col gap-1',
                                                    pad,
                                                    hasMedia && 'pt-2',
                                                )}
                                            >
                                                <ChatReplyQuote
                                                    author={
                                                        comment.reply_to.user
                                                            ?.name
                                                    }
                                                    body={comment.reply_to.body}
                                                    onSelect={() =>
                                                        onSelectMessage(
                                                            comment.reply_to!
                                                                .id,
                                                        )
                                                    }
                                                />
                                            </div>
                                        ) : null}
                                        {hasMedia && scope !== null ? (
                                            <ChatMediaGallery
                                                items={mediaAttachments}
                                                scope={scope}
                                                canCreateFiles={canCreateFiles}
                                                hasFileFields={hasFileFields}
                                                onSaved={onAttachmentSaved}
                                                onAddToField={onAddToField}
                                            />
                                        ) : null}
                                        <div
                                            className={cn(
                                                'flex flex-col gap-1',
                                                pad,
                                                hasMedia && 'pt-1 pb-2',
                                            )}
                                        >
                                            {isEditing ? (
                                                <div className="flex min-w-[12rem] flex-col gap-2">
                                                    <Textarea
                                                        value={editingDraft}
                                                        onChange={(event) =>
                                                            onEditingDraftChange(
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        rows={3}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            onClick={onSaveEdit}
                                                        >
                                                            {t('common.save')}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={
                                                                onCancelEdit
                                                            }
                                                        >
                                                            {t('common.cancel')}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : comment.body !== '' ? (
                                                <div className="whitespace-pre-wrap">
                                                    {renderMessageBody(
                                                        comment.body,
                                                        comment.mentioned_users,
                                                        comment.mentioned_collections,
                                                    )}
                                                </div>
                                            ) : null}
                                            {fileAttachments.length > 0 &&
                                            scope !== null ? (
                                                <ul className="flex max-h-36 w-full min-w-[12rem] flex-col gap-2 overflow-y-auto">
                                                    {fileAttachments.map(
                                                        (attachment) => (
                                                            <li
                                                                key={
                                                                    attachment.id
                                                                }
                                                                className="w-full min-w-0"
                                                            >
                                                                <ChatAttachmentFile
                                                                    attachment={
                                                                        attachment
                                                                    }
                                                                    scope={
                                                                        scope
                                                                    }
                                                                    canCreateFiles={
                                                                        canCreateFiles
                                                                    }
                                                                    hasFileFields={
                                                                        hasFileFields
                                                                    }
                                                                    onSaved={
                                                                        onAttachmentSaved
                                                                    }
                                                                    onAddToField={() =>
                                                                        onAddToField(
                                                                            attachment,
                                                                        )
                                                                    }
                                                                />
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            ) : null}
                                            <div className="flex items-center gap-1 self-end">
                                                {comment.is_pinned ? (
                                                    <Pin
                                                        className="size-2.5 shrink-0 text-muted-foreground"
                                                        aria-hidden
                                                    />
                                                ) : null}
                                                <time
                                                    className="text-xs leading-none text-muted-foreground tabular-nums"
                                                    dateTime={
                                                        comment.created_at ??
                                                        undefined
                                                    }
                                                >
                                                    {commentTime(
                                                        comment.created_at,
                                                    )}
                                                </time>
                                            </div>
                                        </div>
                                    </BubbleContent>
                                    <ChatMessageReactions
                                        reactions={comment.reactions}
                                        align={mine ? 'end' : 'start'}
                                        onToggle={onReact}
                                    />
                                </Bubble>
                            </ChatMessageContextMenu>
                            <ChatMessageActionsButton
                                actions={actions}
                                align={mine ? 'end' : 'start'}
                            />
                        </div>
                    </MessageContent>
                </Message>
            </div>
        </MessageScrollerItem>
    );
}
