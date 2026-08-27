import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ChatCollection, ChatReplyTo, ChatUser } from '@/lib/item-chat-api';
import { cn } from '@/lib/utils';

export type PendingChatFile = {
    key: string;
    file: File;
    previewUrl: string | null;
    progress: number;
    uploadedId: string | null;
    error: string | null;
};

export type PendingChatMessage = {
    clientId: string;
    status: 'sending' | 'uploading' | 'failed';
    body: string;
    mentionedUsers: ChatUser[];
    mentionedCollections: ChatCollection[];
    mentionedIds: number[];
    replyTo: ChatReplyTo | null;
    files: PendingChatFile[];
    error: string | null;
};

/** @deprecated Prefer PendingChatMessage — kept for gradual migration */
export type OutgoingAttachPreview = {
    body: string;
    mentionedUsers: ChatUser[];
    mentionedCollections: ChatCollection[];
    replyTo: ChatReplyTo | null;
    media: Array<{ url: string; mime: string; name: string }>;
    files: Array<{ name: string; mime: string; size: number }>;
};

type Props = {
    pending: PendingChatMessage;
    renderBody: (
        body: string,
        mentions: ChatUser[],
        collections?: ChatCollection[],
    ) => ReactNode;
    onRetry: (clientId: string) => void;
    onRemoveFile: (clientId: string, fileKey: string) => void;
};

function isMediaFile(file: File): boolean {
    return file.type.startsWith('image/') || file.type.startsWith('video/');
}

function pendingTimeLabel(date: Date): string {
    return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Telegram-style optimistic bubble with per-file progress, retry, and trash.
 * Send status lives in the timestamp row so bubble height stays stable.
 */
export function ChatOutgoingAttachPreview({
    pending,
    renderBody,
    onRetry,
    onRemoveFile,
}: Props) {
    const { t } = useTranslation();
    const [sentAt] = useState(() => new Date());
    const media = pending.files.filter((row) => isMediaFile(row.file));
    const docs = pending.files.filter((row) => !isMediaFile(row.file));
    const hasMedia = media.length > 0;
    const failed = pending.status === 'failed';
    const inFlight =
        !failed &&
        (pending.status === 'sending' || pending.status === 'uploading');
    const overlayLabel =
        pending.status === 'uploading'
            ? t('collections.itemChat.uploading')
            : t('collections.itemChat.sendingMedia');
    const retryLabel = t('collections.itemChat.retrySend');
    const errorLabel =
        pending.error ?? t('collections.itemChat.sendError');

    return (
        <div
            className="flex justify-end opacity-90"
            data-test="chat-outgoing-attach-preview"
            data-client-id={pending.clientId}
            data-status={pending.status}
        >
            <Bubble variant="muted" align="end">
                <BubbleContent
                    className={cn(
                        'relative flex w-full min-w-0 flex-col gap-1 text-foreground',
                        hasMedia && 'gap-0 p-0',
                        failed &&
                            'border-destructive ring-1 ring-destructive',
                    )}
                >
                    {hasMedia ? (
                        <div className="relative w-full min-w-[14rem] max-w-sm overflow-hidden bg-black/20">
                            <LocalMediaGrid
                                items={media}
                                onRemoveFile={
                                    failed
                                        ? (key) =>
                                              onRemoveFile(pending.clientId, key)
                                        : undefined
                                }
                            />
                            {!failed ? (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                                    <span className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white">
                                        <Spinner className="size-3.5 text-white" />
                                        {overlayLabel}
                                    </span>
                                </div>
                            ) : null}
                            {media.some((row) => row.progress > 0 && row.progress < 100) ? (
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                                    <div
                                        className="h-full bg-primary transition-[width]"
                                        style={{
                                            width: `${Math.round(
                                                media.reduce(
                                                    (sum, row) =>
                                                        sum + row.progress,
                                                    0,
                                                ) / media.length,
                                            )}%`,
                                        }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {docs.length > 0 ? (
                        <ul
                            className={cn(
                                'flex flex-col gap-1 px-3 pt-2',
                                !pending.body && 'pb-0',
                            )}
                        >
                            {docs.map((file) => (
                                <li
                                    key={file.key}
                                    className="group/file flex items-center gap-2 text-xs text-muted-foreground"
                                >
                                    {file.error ? (
                                        <span className="size-3.5 shrink-0 rounded-full bg-destructive/80" />
                                    ) : file.uploadedId ? (
                                        <span className="size-3.5 shrink-0 rounded-full bg-emerald-500/80" />
                                    ) : (
                                        <Loader2 className="size-3.5 shrink-0 animate-spin" />
                                    )}
                                    <span className="min-w-0 flex-1 truncate">
                                        {file.file.name}
                                        {file.progress > 0 &&
                                        file.progress < 100
                                            ? ` ${file.progress}%`
                                            : ''}
                                    </span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-6 opacity-0 transition-opacity group-hover/file:opacity-100"
                                        aria-label={t(
                                            'collections.itemChat.removePendingFile',
                                        )}
                                        onClick={() =>
                                            onRemoveFile(
                                                pending.clientId,
                                                file.key,
                                            )
                                        }
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {pending.replyTo ? (
                        <div
                            className={cn(
                                'mx-3 mt-2 rounded-md border-l-2 border-primary/60 bg-muted/50 px-2 py-1',
                                !hasMedia && 'mt-0',
                            )}
                        >
                            <div className="truncate text-[11px] font-medium">
                                {pending.replyTo.user?.name}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                                {pending.replyTo.body}
                            </div>
                        </div>
                    ) : null}

                    {pending.body.trim() !== '' ? (
                        <div
                            className={cn(
                                'whitespace-pre-wrap break-words px-3 text-sm',
                                hasMedia || docs.length > 0
                                    ? 'pt-1 pb-1'
                                    : 'pt-2 pb-1',
                            )}
                        >
                            {renderBody(
                                pending.body,
                                pending.mentionedUsers,
                                pending.mentionedCollections,
                            )}
                        </div>
                    ) : null}

                    <div
                        className={cn(
                            'flex items-center gap-1 self-end',
                            hasMedia || docs.length > 0 || pending.body.trim() !== ''
                                ? 'px-3 pb-2'
                                : 'px-3 py-2',
                        )}
                    >
                        {failed ? (
                            <button
                                type="button"
                                className="inline-flex size-3 shrink-0 items-center justify-center text-destructive hover:text-destructive/80"
                                aria-label={retryLabel}
                                title={errorLabel}
                                onClick={() => onRetry(pending.clientId)}
                            >
                                <RotateCcw className="size-3" aria-hidden />
                            </button>
                        ) : inFlight ? (
                            <Spinner
                                className="size-3 text-muted-foreground"
                                aria-label={t('collections.itemChat.sending')}
                            />
                        ) : null}
                        <time
                            className="text-[10px] leading-none text-muted-foreground tabular-nums"
                            dateTime={sentAt.toISOString()}
                        >
                            {pendingTimeLabel(sentAt)}
                        </time>
                    </div>
                </BubbleContent>
            </Bubble>
        </div>
    );
}

function LocalMediaGrid({
    items,
    onRemoveFile,
}: {
    items: PendingChatFile[];
    onRemoveFile?: (key: string) => void;
}) {
    const count = items.length;

    if (count === 1) {
        return (
            <div className="flex min-h-[10rem] justify-center">
                <LocalMediaCell
                    item={items[0]!}
                    single
                    onRemove={
                        onRemoveFile
                            ? () => onRemoveFile(items[0]!.key)
                            : undefined
                    }
                />
            </div>
        );
    }

    if (count === 2) {
        return (
            <div className="grid grid-cols-2 gap-0.5">
                {items.map((item) => (
                    <LocalMediaCell
                        key={item.key}
                        item={item}
                        className="aspect-[3/4] max-h-64"
                        onRemove={
                            onRemoveFile
                                ? () => onRemoveFile(item.key)
                                : undefined
                        }
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-0.5">
            {items.map((item) => (
                <LocalMediaCell
                    key={item.key}
                    item={item}
                    className="aspect-square max-h-44"
                    onRemove={
                        onRemoveFile ? () => onRemoveFile(item.key) : undefined
                    }
                />
            ))}
        </div>
    );
}

function LocalMediaCell({
    item,
    className,
    single = false,
    onRemove,
}: {
    item: PendingChatFile;
    className?: string;
    single?: boolean;
    onRemove?: () => void;
}) {
    const { t } = useTranslation();
    const isVideo = item.file.type.startsWith('video/');
    const url = item.previewUrl;

    return (
        <div className={cn('group/media relative min-h-0 min-w-0 bg-muted', className)}>
            {url ? (
                isVideo ? (
                    <video
                        src={url}
                        className={cn(
                            'h-full w-full object-cover',
                            single && 'max-h-[22rem] object-contain',
                        )}
                        muted
                        playsInline
                        preload="metadata"
                    />
                ) : (
                    <img
                        src={url}
                        alt={item.file.name}
                        className={cn(
                            'h-full w-full object-cover',
                            single && 'max-h-[22rem] object-contain',
                        )}
                    />
                )
            ) : (
                <div className="flex h-full min-h-[6rem] items-center justify-center text-xs text-muted-foreground">
                    {item.file.name}
                </div>
            )}
            {onRemove ? (
                <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute top-1 right-1 size-7 opacity-0 transition-opacity group-hover/media:opacity-100"
                    aria-label={t('collections.itemChat.removePendingFile')}
                    onClick={onRemove}
                >
                    <Trash2 className="size-3.5" />
                </Button>
            ) : null}
        </div>
    );
}
