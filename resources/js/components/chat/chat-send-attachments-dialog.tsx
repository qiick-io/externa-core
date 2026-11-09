import { FileText, Paperclip, Smile, Trash2, X } from 'lucide-react';
import type { DragEvent, RefObject } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatEmojiGrid } from '@/components/chat/chat-emoji-grid';
import { ChatMediaAlbum } from '@/components/chat/chat-media-album';
import { ChatMentionHitLabel } from '@/components/chat/chat-mention-hit';
import type { ChatMentionHit } from '@/components/chat/chat-mention-hit';
import {
    ChatMentionMenu,
    handleMentionMenuKeyDown,
} from '@/components/chat/chat-mention-menu';
import {
    Attachment,
    AttachmentAction,
    AttachmentActions,
    AttachmentContent,
    AttachmentDescription,
    AttachmentMedia,
    AttachmentTitle,
} from '@/components/ui/attachment';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { formatBytes } from '@/lib/format';
import type { ChatAttachment } from '@/lib/item-chat-api';

export type SendAttachItem = {
    key: string;
    file: File;
    previewUrl: string | null;
    uploaded: ChatAttachment | null;
    error: string | null;
};

type AttachCaptionMentionHit = ChatMentionHit;

function isMediaFile(file: File): boolean {
    return file.type.startsWith('image/') || file.type.startsWith('video/');
}

function fileExtension(name: string): string {
    const parts = name.split('.');

    return parts.length > 1 ? (parts.at(-1) ?? '').toLowerCase() : '';
}

type Props = {
    open: boolean;
    items: SendAttachItem[];
    caption: string;
    sending: boolean;
    captionRef: RefObject<HTMLTextAreaElement | null>;
    mentionOpen: boolean;
    mentionHits: AttachCaptionMentionHit[];
    mentionHighlight: number;
    emojiOpen: boolean;
    emojis: readonly string[];
    onCaptionChange: (value: string, caret: number) => void;
    onMentionHighlight: (index: number) => void;
    onPickMention: (hit: AttachCaptionMentionHit) => void;
    onDismissMention: () => void;
    onInsertMentionTrigger: () => void;
    onInsertEmoji: (emoji: string) => void;
    onEmojiOpenChange: (open: boolean) => void;
    onAddFiles: (files: FileList | File[]) => void;
    onRemove: (key: string) => void;
    onClose: () => void;
    onSend: () => void;
    mentionsEnabled?: boolean;
};

/**
 * Telegram-style send-attachments dialog: media grid or mixed file list + caption.
 * Caption reuses parent mention/emoji handlers (same as main composer).
 */
export function ChatSendAttachmentsDialog({
    open,
    items,
    caption,
    sending,
    captionRef,
    mentionOpen,
    mentionHits,
    mentionHighlight,
    emojiOpen,
    emojis,
    onCaptionChange,
    onMentionHighlight,
    onPickMention,
    onDismissMention,
    onInsertMentionTrigger,
    onInsertEmoji,
    onEmojiOpenChange,
    onAddFiles,
    onRemove,
    onClose,
    onSend,
    mentionsEnabled = true,
}: Props) {
    const { t } = useTranslation();
    const addFilesInputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const mediaOnly =
        items.length > 0 && items.every((item) => isMediaFile(item.file));
    const canSend = items.length > 0 && !sending;
    const canAddMore = !sending;
    const showMentions = mentionsEnabled;

    const clearDrag = (): void => {
        setDragOver(false);
    };

    const onDialogDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        if (!canAddMore || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        setDragOver(true);
    };

    const onDialogDragOver = (event: DragEvent<HTMLDivElement>): void => {
        if (!canAddMore || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
    };

    const onDialogDragLeave = (event: DragEvent<HTMLDivElement>): void => {
        const relatedTarget = event.relatedTarget;

        if (
            relatedTarget instanceof Node &&
            event.currentTarget.contains(relatedTarget)
        ) {
            return;
        }

        clearDrag();
    };

    const onDialogDrop = (event: DragEvent<HTMLDivElement>): void => {
        if (!canAddMore || !isExternalFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearDrag();
        onAddFiles(event.dataTransfer.files);
    };

    const title = useMemo(() => {
        const n = items.length;

        if (n === 0) {
            return t('collections.itemChat.attach');
        }

        const allImages = items.every((item) =>
            item.file.type.startsWith('image/'),
        );
        const allMedia = items.every((item) => isMediaFile(item.file));

        if (allImages) {
            return n === 1
                ? t('collections.itemChat.sendPhoto')
                : t('collections.itemChat.sendPhotos', { count: n });
        }

        if (allMedia) {
            return n === 1
                ? t('collections.itemChat.sendMedia')
                : t('collections.itemChat.sendMediaMany', { count: n });
        }

        return n === 1
            ? t('collections.itemChat.sendFile')
            : t('collections.itemChat.sendFiles', { count: n });
    }, [items, t]);

    const mentionMenu = {
        isOpen: showMentions && mentionOpen,
        hits: mentionHits,
        highlightIndex: mentionHighlight,
        onHighlightChange: onMentionHighlight,
        onPick: onPickMention,
        onDismiss: onDismissMention,
    };

    return (
        <Dialog
            open={open && items.length > 0}
            onOpenChange={(next) => {
                if (!next && !sending) {
                    onClose();
                }
            }}
        >
            <DialogContent
                // ponytail: no `relative` here — twMerge drops DialogContent's `fixed` and modal sinks in-flow. `fixed` already contains absolute drop overlay.
                className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg [&>button]:hidden"
                data-test="chat-send-attachments-dialog"
                onDragEnter={onDialogDragEnter}
                onDragOver={onDialogDragOver}
                onDragLeave={onDialogDragLeave}
                onDrop={onDialogDrop}
            >
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        disabled={sending}
                        onClick={onClose}
                        aria-label={t('common.cancel')}
                    >
                        <X className="size-4" />
                    </Button>
                    <DialogTitle className="flex-1 text-center text-base font-semibold">
                        {title}
                    </DialogTitle>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        disabled={!canAddMore}
                        aria-label={t('collections.itemChat.attach')}
                        data-test="chat-send-attachments-add"
                        onClick={() => addFilesInputRef.current?.click()}
                    >
                        <Paperclip className="size-4" />
                    </Button>
                    <input
                        ref={addFilesInputRef}
                        type="file"
                        className="hidden"
                        multiple
                        data-test="chat-send-attachments-add-input"
                        onChange={(event) => {
                            if (event.target.files) {
                                onAddFiles(event.target.files);
                            }

                            event.target.value = '';
                        }}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    {mediaOnly ? (
                        <MediaPreviewGrid items={items} onRemove={onRemove} />
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {items.map((item) => (
                                <li key={item.key} className="min-w-0">
                                    <SendAttachmentFile
                                        item={item}
                                        disabled={sending}
                                        onRemove={() => onRemove(item.key)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="shrink-0 border-t px-3 py-3">
                    <ChatMentionMenu
                        {...mentionMenu}
                        open={mentionMenu.isOpen}
                        renderHit={(hit) => <ChatMentionHitLabel hit={hit} />}
                        textareaRef={captionRef}
                        contentClassName="z-[80]"
                    >
                        <ChatComposer
                            textareaRef={captionRef}
                            value={caption}
                            onValueChange={onCaptionChange}
                            onSubmit={onSend}
                            canSubmit={canSend}
                            isSubmitting={sending}
                            disabled={sending}
                            placeholder={t('collections.itemChat.addCaption')}
                            label={t('collections.itemChat.addCaption')}
                            sendLabel={t('collections.itemChat.send')}
                            textareaTestId="chat-send-caption"
                            submitTestId="chat-send-attachments-submit"
                            onKeyDown={(event) => {
                                if (showMentions) {
                                    handleMentionMenuKeyDown(
                                        event,
                                        mentionMenu,
                                    );
                                }
                            }}
                            actions={
                                <>
                                    {showMentions ? (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            disabled={sending}
                                            aria-label={t(
                                                'collections.itemChat.mention',
                                            )}
                                            data-test="chat-send-caption-mention"
                                            onClick={onInsertMentionTrigger}
                                        >
                                            @
                                        </Button>
                                    ) : null}
                                    <Popover
                                        modal={false}
                                        open={emojiOpen}
                                        onOpenChange={onEmojiOpenChange}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                disabled={sending}
                                                aria-label={t(
                                                    'collections.itemChat.emoji',
                                                )}
                                                data-test="chat-send-caption-emoji"
                                            >
                                                <Smile className="size-4" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className="z-[80] w-64 p-2"
                                            align="start"
                                        >
                                            <ChatEmojiGrid
                                                emojis={emojis}
                                                onSelect={onInsertEmoji}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </>
                            }
                        />
                    </ChatMentionMenu>
                </div>

                {dragOver ? (
                    <div
                        className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10"
                        aria-hidden
                    >
                        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-lg">
                            <Paperclip className="size-4" />
                            {t('collections.itemChat.dropToAttach')}
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

/** One non-media file in the send dialog, on shadcn `Attachment`. */
function SendAttachmentFile({
    item,
    disabled,
    onRemove,
}: {
    item: SendAttachItem;
    disabled: boolean;
    onRemove: () => void;
}) {
    const { t } = useTranslation();
    const uploading = item.uploaded === null && item.error === null;
    const isImage = item.previewUrl && item.file.type.startsWith('image/');

    return (
        <Attachment
            state={item.error ? 'error' : uploading ? 'uploading' : 'done'}
            className="w-full"
            data-test="chat-send-attachment"
        >
            <AttachmentMedia variant={isImage ? 'image' : 'icon'}>
                {uploading ? (
                    <Spinner />
                ) : isImage ? (
                    <img src={item.previewUrl!} alt="" />
                ) : (
                    <FileText className="text-muted-foreground" />
                )}
            </AttachmentMedia>
            <AttachmentContent>
                <AttachmentTitle>{item.file.name}</AttachmentTitle>
                <AttachmentDescription>
                    {item.error ??
                        (uploading
                            ? t('collections.itemChat.uploading')
                            : [
                                  fileExtension(item.file.name).toUpperCase(),
                                  formatBytes(item.file.size),
                              ]
                                  .filter(Boolean)
                                  .join(' · '))}
                </AttachmentDescription>
            </AttachmentContent>
            {uploading ? null : (
                <AttachmentActions>
                    <AttachmentAction
                        disabled={disabled}
                        onClick={onRemove}
                        aria-label={t('common.delete')}
                    >
                        <Trash2 />
                    </AttachmentAction>
                </AttachmentActions>
            )}
        </Attachment>
    );
}

/** Media preview = same ChatMediaAlbum as bubble; remove/upload are overlays only. */
function MediaPreviewGrid({
    items,
    onRemove,
}: {
    items: SendAttachItem[];
    onRemove: (key: string) => void;
}) {
    const { t } = useTranslation();

    return (
        <ChatMediaAlbum
            className="mx-auto rounded-xl"
            items={items.map((item) => ({
                key: item.key,
                src: item.previewUrl,
                isVideo: item.file.type.startsWith('video/'),
                name: item.file.name,
            }))}
            renderOverlay={(_, index) => {
                const item = items[index]!;

                return (
                    <>
                        <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                            {item.uploaded === null && item.error === null ? (
                                <span className="rounded-full bg-background/80 p-2 shadow">
                                    <Spinner className="size-3.5" />
                                </span>
                            ) : null}
                            <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="size-7 bg-background/80 opacity-0 shadow backdrop-blur transition-opacity group-hover/media:opacity-100 focus-visible:opacity-100"
                                onClick={() => onRemove(item.key)}
                                aria-label={t('common.delete')}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                        {item.error ? (
                            <div className="absolute inset-x-0 bottom-0 z-10 bg-destructive/90 px-2 py-1 text-xs break-all text-destructive-foreground">
                                {item.error}
                            </div>
                        ) : null}
                    </>
                );
            }}
        />
    );
}
