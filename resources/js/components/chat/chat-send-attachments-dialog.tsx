import { FileText, Paperclip, Send, Smile, Trash2, X } from 'lucide-react';
import type { DragEvent, Ref } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isExternalFileDrag } from '@/components/admin/file-dropzone';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { ChatAttachment } from '@/lib/item-chat-api';
import { collectionMentionLabel } from '@/lib/item-chat-mentions';
import { cn } from '@/lib/utils';

export type SendAttachItem = {
    key: string;
    file: File;
    previewUrl: string | null;
    uploaded: ChatAttachment | null;
    error: string | null;
};

export type AttachCaptionMentionHit =
    | { type: 'user'; id: number; name: string; email?: string }
    | { type: 'collection'; id: number; name: string };

function isMediaFile(file: File): boolean {
    return (
        file.type.startsWith('image/') || file.type.startsWith('video/')
    );
}

function formatBytes(size: number): string {
    if (size < 1024) {
        return `${size} B`;
    }

    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
    captionRef: Ref<HTMLTextAreaElement>;
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
}: Props) {
    const { t } = useTranslation();
    const addFilesInputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const mediaOnly =
        items.length > 0 && items.every((item) => isMediaFile(item.file));
    const uploading = items.some(
        (item) => item.uploaded === null && item.error === null,
    );
    const canSend = items.length > 0 && !sending;
    const canAddMore = !sending;

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
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
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
                        className="size-8 shrink-0"
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
                                <li
                                    key={item.key}
                                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
                                >
                                    <FileThumb item={item} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">
                                            {item.file.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {item.error ? (
                                                <span className="text-destructive">
                                                    {item.error}
                                                </span>
                                            ) : item.uploaded ? (
                                                formatBytes(item.file.size)
                                            ) : (
                                                t(
                                                    'collections.itemChat.uploading',
                                                )
                                            )}
                                        </div>
                                    </div>
                                    {item.uploaded === null &&
                                    item.error === null ? (
                                        <Spinner className="size-4 shrink-0" />
                                    ) : (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="size-8 shrink-0 text-muted-foreground"
                                            disabled={sending}
                                            onClick={() => onRemove(item.key)}
                                            aria-label={t('common.delete')}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex shrink-0 flex-col gap-2 border-t px-3 py-3">
                    <div className="relative">
                        {mentionOpen && mentionHits.length > 0 ? (
                            <div className="absolute inset-x-0 bottom-full z-30 mb-1 max-h-40 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                                {mentionHits.map((hit, index) => (
                                    <button
                                        key={`${hit.type}-${hit.id}`}
                                        type="button"
                                        className={
                                            index === mentionHighlight
                                                ? 'flex w-full flex-col items-start rounded bg-muted px-2 py-1 text-left text-sm'
                                                : 'flex w-full flex-col items-start rounded px-2 py-1 text-left text-sm hover:bg-muted'
                                        }
                                        onMouseEnter={() =>
                                            onMentionHighlight(index)
                                        }
                                        onClick={() => onPickMention(hit)}
                                    >
                                        <span>
                                            {hit.type === 'collection'
                                                ? collectionMentionLabel(hit)
                                                : hit.name}
                                        </span>
                                        {hit.type === 'user' && hit.email ? (
                                            <span className="text-xs text-muted-foreground">
                                                {hit.email}
                                            </span>
                                        ) : hit.type === 'collection' ? (
                                            <span className="text-xs text-muted-foreground">
                                                collection
                                            </span>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <Textarea
                            ref={captionRef}
                            value={caption}
                            rows={2}
                            placeholder={t('collections.itemChat.addCaption')}
                            className="min-h-10 resize-none"
                            data-test="chat-send-caption"
                            disabled={sending}
                            onChange={(event) =>
                                onCaptionChange(
                                    event.target.value,
                                    event.target.selectionStart,
                                )
                            }
                            onKeyDown={(event) => {
                                if (event.nativeEvent.isComposing) {
                                    return;
                                }

                                if (mentionOpen && mentionHits.length > 0) {
                                    if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        onMentionHighlight(
                                            (mentionHighlight + 1) %
                                                mentionHits.length,
                                        );

                                        return;
                                    }

                                    if (event.key === 'ArrowUp') {
                                        event.preventDefault();
                                        onMentionHighlight(
                                            (mentionHighlight -
                                                1 +
                                                mentionHits.length) %
                                                mentionHits.length,
                                        );

                                        return;
                                    }

                                    if (
                                        event.key === 'Enter' &&
                                        !event.shiftKey &&
                                        !event.metaKey &&
                                        !event.ctrlKey
                                    ) {
                                        event.preventDefault();
                                        onPickMention(
                                            mentionHits[mentionHighlight]!,
                                        );

                                        return;
                                    }

                                    if (event.key === 'Escape') {
                                        event.preventDefault();
                                        onDismissMention();

                                        return;
                                    }
                                }

                                if (
                                    event.key === 'Enter' &&
                                    !event.shiftKey &&
                                    canSend
                                ) {
                                    event.preventDefault();
                                    onSend();
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            disabled={sending}
                            aria-label={t('collections.itemChat.mention')}
                            data-test="chat-send-caption-mention"
                            onClick={onInsertMentionTrigger}
                        >
                            @
                        </Button>
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
                                    className="size-8"
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
                                <div className="grid grid-cols-8 gap-1">
                                    {emojis.map((emoji) => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            className="rounded p-1 text-lg hover:bg-muted"
                                            onClick={() => onInsertEmoji(emoji)}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button
                            type="button"
                            size="icon"
                            className="ml-auto size-10 shrink-0 rounded-full"
                            disabled={!canSend}
                            data-test="chat-send-attachments-submit"
                            onClick={onSend}
                            aria-label={t('collections.itemChat.send')}
                        >
                            {sending ? (
                                <Spinner className="size-4" />
                            ) : (
                                <Send className="size-4" />
                            )}
                        </Button>
                    </div>
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

function FileThumb({ item }: { item: SendAttachItem }) {
    if (item.previewUrl && item.file.type.startsWith('image/')) {
        return (
            <img
                src={item.previewUrl}
                alt=""
                className="size-11 shrink-0 rounded-md object-cover"
            />
        );
    }

    const ext = fileExtension(item.file.name);

    return (
        <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-primary/15 text-primary">
            <FileText className="size-4" aria-hidden />
            {ext ? (
                <span className="text-[9px] font-bold uppercase leading-none">
                    {ext.slice(0, 4)}
                </span>
            ) : null}
        </div>
    );
}

function MediaPreviewGrid({
    items,
    onRemove,
}: {
    items: SendAttachItem[];
    onRemove: (key: string) => void;
}) {
    const count = items.length;

    if (count === 1) {
        return (
            <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg bg-black/20">
                <MediaCell item={items[0]!} single onRemove={onRemove} />
            </div>
        );
    }

    if (count === 2) {
        return (
            <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-lg">
                {items.map((item) => (
                    <MediaCell
                        key={item.key}
                        item={item}
                        className="aspect-[3/4] max-h-64"
                        onRemove={onRemove}
                    />
                ))}
            </div>
        );
    }

    if (count === 3) {
        return (
            <div className="grid aspect-[4/5] max-h-80 grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg">
                <MediaCell
                    item={items[0]!}
                    className="row-span-2"
                    onRemove={onRemove}
                />
                <MediaCell item={items[1]!} onRemove={onRemove} />
                <MediaCell item={items[2]!} onRemove={onRemove} />
            </div>
        );
    }

    return (
        <div
            className={cn(
                'grid gap-1 overflow-hidden rounded-lg',
                count === 4 ? 'grid-cols-2' : 'grid-cols-3',
            )}
        >
            {items.map((item) => (
                <MediaCell
                    key={item.key}
                    item={item}
                    className="aspect-square max-h-40"
                    onRemove={onRemove}
                />
            ))}
        </div>
    );
}

function MediaCell({
    item,
    className,
    single = false,
    onRemove,
}: {
    item: SendAttachItem;
    className?: string;
    single?: boolean;
    onRemove: (key: string) => void;
}) {
    const { t } = useTranslation();
    const isVideo = item.file.type.startsWith('video/');

    return (
        <div
            className={cn(
                'group/preview relative min-h-0 min-w-0 bg-black/30',
                className,
            )}
        >
            {item.previewUrl ? (
                isVideo ? (
                    <video
                        src={item.previewUrl}
                        className={cn(
                            'h-full w-full',
                            single
                                ? 'max-h-[22rem] object-contain'
                                : 'object-cover',
                        )}
                        muted
                        playsInline
                        preload="metadata"
                    />
                ) : (
                    <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className={cn(
                            'h-full w-full',
                            single
                                ? 'max-h-[22rem] object-contain'
                                : 'object-cover',
                        )}
                    />
                )
            ) : (
                <div className="flex h-32 items-center justify-center overflow-hidden px-2 text-center text-xs break-all text-muted-foreground">
                    {item.file.name}
                </div>
            )}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                {item.uploaded === null && item.error === null ? (
                    <span className="rounded-full bg-background/80 p-1.5 shadow">
                        <Spinner className="size-3.5" />
                    </span>
                ) : null}
                <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-7 bg-background/80 opacity-0 shadow backdrop-blur transition-opacity group-hover/preview:opacity-100 focus-visible:opacity-100"
                    onClick={() => onRemove(item.key)}
                    aria-label={t('common.delete')}
                >
                    <Trash2 className="size-3.5" />
                </Button>
            </div>
            {item.error ? (
                <div className="absolute inset-x-0 bottom-0 break-all bg-destructive/90 px-2 py-1 text-[10px] text-destructive-foreground">
                    {item.error}
                </div>
            ) : null}
        </div>
    );
}
