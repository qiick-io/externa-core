import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { ChatAttachment, ChatScope } from '@/lib/item-chat-api';
import {
    chatAttachmentPreviewUrl,
    chatAttachmentUrl,
} from '@/lib/item-chat-api';
import { cn } from '@/lib/utils';

async function fetchBlobWithProgress(
    url: string,
    onProgress: (percent: number | null) => void,
    signal?: AbortSignal,
): Promise<Blob> {
    const response = await fetch(url, { credentials: 'same-origin', signal });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const totalHeader = response.headers.get('Content-Length');
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : NaN;
    const hasTotal = Number.isFinite(total) && total > 0;

    if (!response.body || !hasTotal) {
        onProgress(null);
        const blob = await response.blob();
        onProgress(100);

        return blob;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    onProgress(0);

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        loaded += value.length;
        onProgress(Math.min(100, Math.round((loaded / total) * 100)));
    }

    onProgress(100);

    return new Blob(chunks, {
        type: response.headers.get('Content-Type') ?? undefined,
    });
}

function ChatMediaLightboxImage({
    attachment,
    scope,
}: {
    attachment: ChatAttachment;
    scope: ChatScope;
}) {
    const { t } = useTranslation();
    const fullUrl = chatAttachmentUrl(scope, attachment.id);
    const previewUrl = chatAttachmentPreviewUrl(scope, attachment);
    const needsFullFetch = Boolean(attachment.has_preview);

    const [displayUrl, setDisplayUrl] = useState(
        needsFullFetch ? previewUrl : fullUrl,
    );
    const [loadingFullRes, setLoadingFullRes] = useState(needsFullFetch);
    const [progress, setProgress] = useState<number | null>(
        needsFullFetch ? 0 : null,
    );
    const [waitingImg, setWaitingImg] = useState(!needsFullFetch);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
        setWaitingImg(!needsFullFetch);

        if (!needsFullFetch) {
            setDisplayUrl(fullUrl);
            setLoadingFullRes(false);
            setProgress(null);

            return;
        }

        const controller = new AbortController();
        let blobUrl: string | null = null;

        setDisplayUrl(previewUrl);
        setLoadingFullRes(true);
        setProgress(0);

        void (async () => {
            try {
                const blob = await fetchBlobWithProgress(
                    fullUrl,
                    setProgress,
                    controller.signal,
                );

                blobUrl = URL.createObjectURL(blob);
                setDisplayUrl(blobUrl);
                setLoadingFullRes(false);
                setProgress(100);
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                setLoadingFullRes(false);
                setProgress(null);
                setDisplayUrl(fullUrl);
                setFailed(true);
            }
        })();

        return () => {
            controller.abort();

            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [attachment.id, fullUrl, needsFullFetch, previewUrl]);

    const showOverlay =
        loadingFullRes || (waitingImg && !failed && !needsFullFetch);

    return (
        <div className="relative flex max-h-full max-w-full items-center justify-center">
            <img
                key={attachment.id}
                src={displayUrl}
                alt={attachment.name}
                className={cn(
                    'max-h-full max-w-full object-contain transition-opacity',
                    showOverlay ? 'opacity-50' : 'opacity-100',
                )}
                onLoad={() => setWaitingImg(false)}
                onError={() => {
                    setWaitingImg(false);
                    setFailed(true);
                }}
            />

            {showOverlay ? (
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6"
                    aria-live="polite"
                >
                    <Spinner className="size-8 text-white" />
                    <div className="w-full max-w-xs">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                            <div
                                className={cn(
                                    'h-full bg-white transition-all',
                                    progress == null && 'w-1/3 animate-pulse',
                                )}
                                style={
                                    progress != null
                                        ? { width: `${progress}%` }
                                        : undefined
                                }
                            />
                        </div>
                    </div>
                    <span className="text-xs text-white/90">
                        {progress != null
                            ? t('collections.itemChat.mediaLoadingFullResPercent', {
                                  percent: progress,
                              })
                            : t('collections.itemChat.mediaLoadingFullRes')}
                    </span>
                </div>
            ) : null}

            {failed ? (
                <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
                    <span className="rounded-full bg-black/70 px-3 py-1 text-xs text-white/90">
                        {t('collections.itemChat.mediaLoadError')}
                    </span>
                </div>
            ) : null}
        </div>
    );
}

type Props = {
    open: boolean;
    items: ChatAttachment[];
    initialIndex: number;
    scope: ChatScope;
    onOpenChange: (open: boolean) => void;
};

/**
 * Fullscreen media preview (antd Image.Preview–style) over chat attachments.
 * shadcn has no Image.Preview — Dialog + local index is enough.
 */
export function ChatMediaLightbox({
    open,
    items,
    initialIndex,
    scope,
    onOpenChange,
}: Props) {
    const { t } = useTranslation();
    const [index, setIndex] = useState(initialIndex);
    const count = items.length;
    const current = items[index] ?? null;
    const videoHref = current ? chatAttachmentUrl(scope, current.id) : null;
    const isVideo = current?.mime.startsWith('video/') ?? false;
    const canPrev = count > 1;
    const canNext = count > 1;

    useEffect(() => {
        if (open) {
            setIndex(Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)));
        }
    }, [open, initialIndex, count]);

    useEffect(() => {
        if (!open || count < 2) {
            return;
        }

        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setIndex((prev) => (prev - 1 + count) % count);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                setIndex((prev) => (prev + 1) % count);
            }
        };

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [open, count]);

    return (
        <Dialog open={open && count > 0} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 rounded-none border-0 bg-black/95 p-0 shadow-none sm:max-w-none"
                data-test="chat-media-lightbox"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>
                        {current?.name ?? t('collections.itemChat.mediaPreview')}
                    </DialogTitle>
                </DialogHeader>

                <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 py-10">
                    {current ? (
                        isVideo && videoHref ? (
                            <video
                                key={current.id}
                                src={videoHref}
                                className="max-h-full max-w-full object-contain"
                                controls
                                autoPlay
                                playsInline
                            />
                        ) : (
                            <ChatMediaLightboxImage
                                key={current.id}
                                attachment={current}
                                scope={scope}
                            />
                        )
                    ) : null}

                    {canPrev ? (
                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute top-1/2 left-3 size-10 -translate-y-1/2 rounded-full bg-background/80"
                            aria-label={t('collections.itemChat.previousMedia')}
                            onClick={() =>
                                setIndex((prev) => (prev - 1 + count) % count)
                            }
                        >
                            <ChevronLeft className="size-5" />
                        </Button>
                    ) : null}

                    {canNext ? (
                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute top-1/2 right-3 size-10 -translate-y-1/2 rounded-full bg-background/80"
                            aria-label={t('collections.itemChat.nextMedia')}
                            onClick={() =>
                                setIndex((prev) => (prev + 1) % count)
                            }
                        >
                            <ChevronRight className="size-5" />
                        </Button>
                    ) : null}
                </div>

                {count > 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
                        <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                            {t('collections.itemChat.mediaIndex', {
                                current: index + 1,
                                total: count,
                            })}
                        </span>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
