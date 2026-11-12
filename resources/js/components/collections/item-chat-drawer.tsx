import { usePage } from '@inertiajs/react';
import { Paperclip } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessageScrollerHandle } from '@/components/chat/chat-message-scroller';
import { ChatSendAttachmentsDialog } from '@/components/chat/chat-send-attachments-dialog';
import { ChatThreadHeader } from '@/components/chat/chat-thread-header';
import { ItemChatAddToFieldDialog } from '@/components/collections/item-chat/item-chat-add-to-field-dialog';
import { ItemChatComposerFooter } from '@/components/collections/item-chat/item-chat-composer-footer';
import { EMOJI_GRID } from '@/components/collections/item-chat/item-chat-format';
import { ItemChatMessageItem } from '@/components/collections/item-chat/item-chat-message-item';
import { ItemChatMessageList } from '@/components/collections/item-chat/item-chat-message-list';
import { useChatComposer } from '@/components/collections/item-chat/use-chat-composer';
import { useChatFeed } from '@/components/collections/item-chat/use-chat-feed';
import { useChatMessageActions } from '@/components/collections/item-chat/use-chat-message-actions';
import { useChatPendingMessages } from '@/components/collections/item-chat/use-chat-pending-messages';
import { useChatRealtime } from '@/components/collections/item-chat/use-chat-realtime';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { DropOverlay } from '@/components/drop-overlay';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import type { ChatThreadIdentity } from '@/lib/chat-thread-identity';
import { chatMentionsEnabled } from '@/lib/chat-thread-identity';
import { isRealtimeEnabled } from '@/lib/echo';
import { putChatNotify } from '@/lib/item-chat-api';
import type { ChatAttachment } from '@/lib/item-chat-api';
import type { CollectionFieldRow } from '@/types/collections';

const FILE_FIELD_TYPES = new Set(['image', 'files']);

type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    collectionId?: number;
    itemId?: number;
    chatId?: string | null;
    kind?: 'item' | 'direct';
    variant?: 'drawer' | 'pane';
    fields: CollectionFieldRow[];
    chatCount: number;
    onChatCountChange: (count: number) => void;
    thread?: ChatThreadIdentity | null;
    canCreateDirect?: boolean;
    /** Pane only: back to the thread list below `md`. */
    onBack?: () => void;
};

/**
 * Chat drawer for a collection item, also used as the thread pane of the chat hub.
 *
 * It wires the thread hooks together (feed, pending sends, realtime, composer and
 * message actions in `item-chat/`) and lays out the header, the message list, the
 * composer footer and the dialogs. The refs below are shared by those hooks so that
 * Echo listeners and in-flight requests always see the current thread and count.
 */
export function ItemChatDrawer({
    open,
    onOpenChange,
    collectionId,
    itemId,
    chatId = null,
    kind = 'item',
    variant = 'drawer',
    fields,
    chatCount,
    onChatCountChange,
    thread = null,
    canCreateDirect = false,
    onBack,
}: Props) {
    const { t } = useTranslation();
    const page = usePage();
    const { can } = useCan();
    const viewerId = page.props.auth.user?.id ?? 0;
    const viewerName =
        [page.props.auth.user?.first_name, page.props.auth.user?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() ||
        page.props.auth.user?.email ||
        '';
    const realtimeOn = isRealtimeEnabled(page.props.realtime);
    const chatMaxUploadBytes =
        page.props.projectSettings?.chatMaxUploadBytes ?? null;
    const canCreateFiles = can(PermissionEnum.CanCreateFiles);
    const fileFields = fields.filter((field) =>
        FILE_FIELD_TYPES.has(field.type),
    );

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const scrollerRef = useRef<ChatMessageScrollerHandle | null>(null);
    // Own sends and own echoes jump to the latest message, even when scrolled up.
    const forceScrollBottomRef = useRef(false);
    // Oldest loaded message before "Load older", to keep it in view after the prepend.
    const olderAnchorIdRef = useRef<number | null>(null);
    const liveChatIdRef = useRef<string | null>(chatId);
    const chatCountRef = useRef(chatCount);
    // Deleted message ids already taken off the count (by the delete reply or its echo).
    const countedDeletionIdsRef = useRef<Set<number>>(new Set());
    const onChatCountChangeRef = useRef(onChatCountChange);
    const [addFieldFor, setAddFieldFor] = useState<ChatAttachment | null>(null);
    const [addFieldName, setAddFieldName] = useState('');

    useLayoutEffect(() => {
        chatCountRef.current = chatCount;
        onChatCountChangeRef.current = onChatCountChange;
    });

    const mentionsEnabled = useMemo(
        () =>
            kind === 'item'
                ? true
                : thread
                  ? chatMentionsEnabled(kind, thread.participants, viewerId)
                  : false,
        [kind, thread, viewerId],
    );

    const feed = useChatFeed({
        open,
        collectionId,
        itemId,
        chatId,
        variant,
        liveChatIdRef,
        onChatCountChangeRef,
        olderAnchorIdRef,
    });
    const { liveChatId, scope, scopeKey, messages, loadingMore } = feed;

    const pending = useChatPendingMessages({
        open,
        scope,
        scopeKey,
        realtimeOn,
        chatMaxUploadBytes,
        load: feed.load,
        liveChatIdRef,
        chatCountRef,
        onChatCountChangeRef,
        forceScrollBottomRef,
    });
    const { pendingMessages } = pending;

    const realtime = useChatRealtime({
        open,
        realtimeOn,
        liveChatId,
        scope,
        scopeKey,
        viewerId,
        viewerName,
        messages,
        liveChatIdRef,
        chatCountRef,
        countedDeletionIdsRef,
        onChatCountChangeRef,
        forceScrollBottomRef,
        dropEchoedPending: pending.dropEchoedPending,
    });

    const composer = useChatComposer({
        open,
        scope,
        scopeKey,
        mentionsEnabled,
        chatMaxUploadBytes,
        textareaRef,
        captionTextareaRef,
        whisperTyping: realtime.whisperTyping,
        enqueuePending: pending.enqueuePending,
        setError: feed.setError,
    });

    const messageActions = useChatMessageActions({
        open,
        scope,
        scopeKey,
        viewerId,
        viewerName,
        liveChatIdRef,
        chatCountRef,
        countedDeletionIdsRef,
        onChatCountChangeRef,
        textareaRef,
        setReplyTo: composer.setReplyTo,
        setError: feed.setError,
        load: feed.load,
    });

    useEffect(() => {
        if (forceScrollBottomRef.current) {
            forceScrollBottomRef.current = false;
            scrollerRef.current?.scrollToEnd({ behavior: 'smooth' });
        }
    }, [messages, pendingMessages]);

    useEffect(() => {
        const olderAnchorId = olderAnchorIdRef.current;

        // Wait until load-more finishes so the prepend is in the DOM.
        if (olderAnchorId === null || loadingMore) {
            return;
        }

        olderAnchorIdRef.current = null;
        scrollerRef.current?.scrollToMessage(String(olderAnchorId), {
            align: 'start',
        });
    }, [loadingMore, messages]);

    const scrollToMessage = (id: number): void => {
        scrollerRef.current?.scrollToMessage(String(id), {
            align: 'center',
            behavior: 'smooth',
        });
    };

    const openAddToField = (attachment: ChatAttachment): void => {
        setAddFieldFor(attachment);
        setAddFieldName(fileFields[0]?.name ?? '');
    };

    const threadShell = (
        <>
            <ChatThreadHeader
                thread={thread}
                kind={kind}
                viewerId={viewerId}
                variant={variant}
                liveChatId={liveChatId}
                notify={feed.notify}
                onNotifyChange={(next) => {
                    feed.setNotify(next);

                    if (scope) {
                        void putChatNotify(scope, next).catch(() =>
                            feed.setNotify(!next),
                        );
                    }
                }}
                canCreateDirect={canCreateDirect}
                onBack={onBack}
            />
            <div
                className="relative flex min-h-0 flex-1 flex-col"
                data-test="chat-file-dropzone"
                onDragEnter={composer.onComposerDragEnter}
                onDragOver={composer.onComposerDragOver}
                onDragLeave={composer.onComposerDragLeave}
                onDrop={composer.onComposerDrop}
            >
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <ItemChatMessageList
                        scopeKey={scopeKey}
                        scrollerRef={scrollerRef}
                        messages={messages}
                        pinned={feed.pinned}
                        pendingMessages={pendingMessages}
                        typingNames={realtime.typingNames}
                        hasMore={feed.hasMore}
                        loading={feed.loading}
                        loadingMore={loadingMore}
                        error={feed.error}
                        onLoadOlder={feed.loadOlder}
                        onSelectMessage={scrollToMessage}
                        onRetryPending={pending.retryPending}
                        onRemovePendingFile={pending.removePendingFile}
                        renderMessage={({
                            comment,
                            isGroupStart,
                            previousCreatedAt,
                        }) => (
                            <ItemChatMessageItem
                                key={comment.id}
                                comment={comment}
                                isGroupStart={isGroupStart}
                                previousCreatedAt={previousCreatedAt}
                                viewerId={viewerId}
                                scope={scope}
                                canCreateFiles={canCreateFiles}
                                hasFileFields={fileFields.length > 0}
                                actions={messageActions.messageActionsFor(
                                    comment,
                                )}
                                isEditing={
                                    messageActions.editingId === comment.id
                                }
                                editingDraft={messageActions.editingDraft}
                                onEditingDraftChange={
                                    messageActions.setEditingDraft
                                }
                                onSaveEdit={() =>
                                    messageActions.saveEdit(comment)
                                }
                                onCancelEdit={() =>
                                    messageActions.setEditingId(null)
                                }
                                onAttachmentSaved={(next) =>
                                    messageActions.onAttachmentSaved(
                                        comment.id,
                                        next,
                                    )
                                }
                                onAddToField={openAddToField}
                                onSelectMessage={scrollToMessage}
                                onReact={(emoji) =>
                                    messageActions.onReact(comment, emoji)
                                }
                            />
                        )}
                    />
                </div>
                <ItemChatComposerFooter
                    variant={variant}
                    textareaRef={textareaRef}
                    draft={composer.draft}
                    canSubmit={
                        composer.draft.trim() !== '' &&
                        !composer.attachDialogOpen
                    }
                    replyTo={composer.replyTo}
                    onCancelReply={() => composer.setReplyTo(null)}
                    mentionsEnabled={mentionsEnabled}
                    mentionMenu={composer.mentionMenu}
                    emojiOpen={composer.emojiOpen}
                    onEmojiOpenChange={composer.setEmojiOpen}
                    onValueChange={composer.onComposerChange}
                    onSubmit={composer.send}
                    insertAtCaret={composer.insertAtCaret}
                    insertMentionTrigger={composer.insertMentionTrigger}
                    onPickFiles={composer.onPickFiles}
                />
                {composer.composerDragOver ? (
                    <DropOverlay
                        icon={Paperclip}
                        title={t('collections.itemChat.dropToAttach')}
                    />
                ) : null}
            </div>
        </>
    );

    return (
        <>
            {variant === 'pane' ? (
                open ? (
                    <div
                        data-test="chat-thread-pane"
                        className="flex h-full min-h-0 flex-col overflow-hidden"
                    >
                        {threadShell}
                    </div>
                ) : null
            ) : (
                <Drawer
                    open={open}
                    onOpenChange={onOpenChange ?? (() => undefined)}
                    direction="right"
                    dismissible
                >
                    <DrawerContent
                        data-test="item-chat-drawer"
                        className="data-[vaul-drawer-direction=right]:max-w-md"
                        aria-label={
                            thread?.title ?? t('collections.itemChat.title')
                        }
                    >
                        {threadShell}
                    </DrawerContent>
                </Drawer>
            )}

            {composer.attachDialogOpen && composer.attachItems.length > 0 ? (
                <ChatSendAttachmentsDialog
                    open
                    items={composer.attachItems}
                    caption={composer.attachCaption}
                    sending={false}
                    captionRef={captionTextareaRef}
                    mentionOpen={composer.mentionOpen}
                    mentionHits={composer.mentionHits}
                    mentionHighlight={composer.mentionHighlight}
                    emojiOpen={composer.emojiOpen}
                    emojis={EMOJI_GRID}
                    onCaptionChange={composer.onComposerChange}
                    onMentionHighlight={composer.setMentionHighlight}
                    onPickMention={composer.pickMention}
                    onDismissMention={composer.dismissMention}
                    onInsertMentionTrigger={composer.insertMentionTrigger}
                    onInsertEmoji={(emoji) => {
                        composer.insertAtCaret(emoji);
                        composer.setEmojiOpen(false);
                    }}
                    onEmojiOpenChange={composer.setEmojiOpen}
                    onAddFiles={composer.onPickFiles}
                    onRemove={composer.removeAttachItem}
                    onClose={composer.closeAttachDialog}
                    onSend={composer.sendAttachBatch}
                    mentionsEnabled={mentionsEnabled}
                />
            ) : null}

            <ItemChatAddToFieldDialog
                attachment={addFieldFor}
                scope={scope}
                fileFields={fileFields}
                fieldName={addFieldName}
                onFieldNameChange={setAddFieldName}
                onClose={() => setAddFieldFor(null)}
                onError={feed.setError}
            />

            <ConfirmDestructiveDialog
                open={messageActions.messagePendingDelete !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        messageActions.setMessagePendingDelete(null);
                    }
                }}
                title={t('confirmDestructive.deleteMessageTitle')}
                description={t('confirmDestructive.deleteMessageDescription')}
                onConfirm={() => {
                    if (messageActions.messagePendingDelete !== null) {
                        messageActions.removeMessage(
                            messageActions.messagePendingDelete,
                        );
                    }

                    messageActions.setMessagePendingDelete(null);
                }}
            />
        </>
    );
}
