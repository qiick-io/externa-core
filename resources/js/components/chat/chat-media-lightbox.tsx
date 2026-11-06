import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from '@/components/ui/carousel';
import type { CarouselApi } from '@/components/ui/carousel';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
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

    return new Blob(chunks as BlobPart[], {
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
            } catch {
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
                    <Progress
                        value={progress ?? undefined}
                        aria-label={t(
                            'collections.itemChat.mediaLoadingFullRes',
                        )}
                        className={cn(
                            'w-full max-w-xs',
                            progress == null && 'animate-pulse',
                        )}
                    />
                    <span className="text-xs text-white/90">
                        {progress != null
                            ? t(
                                  'collections.itemChat.mediaLoadingFullResPercent',
                                  {
                                      percent: progress,
                                  },
                              )
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
 * Fullscreen media preview over chat attachments: a Dialog holding a shadcn
 * `carousel` (embla) with swipe, the arrow keys and previous / next buttons.
 * Only the current slide loads its full-resolution file; the others show the
 * preview.
 */
export function ChatMediaLightbox({
    open,
    items,
    initialIndex,
    scope,
    onOpenChange,
}: Props) {
    const { t } = useTranslation();
    const [api, setApi] = useState<CarouselApi>();
    const count = items.length;
    const startIndex = Math.min(
        Math.max(initialIndex, 0),
        Math.max(count - 1, 0),
    );
    const [index, setIndex] = useState(startIndex);

    useEffect(() => {
        if (open) {
            setIndex(startIndex);
        }
    }, [open, startIndex]);

    useEffect(() => {
        if (!api) {
            return;
        }

        const onSelect = (): void => setIndex(api.selectedScrollSnap());

        onSelect();
        api.on('select', onSelect);

        return () => {
            api.off('select', onSelect);
        };
    }, [api]);

    const current = items[index] ?? null;

    return (
        <Dialog open={open && count > 0} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 rounded-none border-0 bg-black/95 p-0 shadow-none sm:max-w-none"
                data-test="chat-media-lightbox"
                onOpenAutoFocus={(event) => {
                    // Land on the carousel so the arrow keys move between items.
                    event.preventDefault();
                    (event.currentTarget as HTMLElement | null)
                        ?.querySelector<HTMLElement>('[data-slot="carousel"]')
                        ?.focus();
                }}
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>
                        {current?.name ??
                            t('collections.itemChat.mediaPreview')}
                    </DialogTitle>
                </DialogHeader>
                <Carousel
                    setApi={setApi}
                    opts={{ startIndex, loop: count > 1 }}
                    tabIndex={-1}
                    aria-label={t('collections.itemChat.mediaPreview')}
                    className="min-h-0 flex-1 outline-none *:data-[slot=carousel-content]:h-full"
                >
                    <CarouselContent className="ml-0 h-full">
                        {items.map((item, itemIndex) => (
                            <CarouselItem
                                key={item.id}
                                className="flex h-full items-center justify-center px-12 py-12"
                                aria-label={t(
                                    'collections.itemChat.mediaIndex',
                                    {
                                        current: itemIndex + 1,
                                        total: count,
                                    },
                                )}
                            >
                                <LightboxSlide
                                    item={item}
                                    scope={scope}
                                    isCurrent={itemIndex === index}
                                />
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    {count > 1 ? (
                        <>
                            <CarouselPrevious
                                className="left-3 size-10 bg-background/80"
                                aria-label={t(
                                    'collections.itemChat.previousMedia',
                                )}
                            />
                            <CarouselNext
                                className="right-3 size-10 bg-background/80"
                                aria-label={t('collections.itemChat.nextMedia')}
                            />
                        </>
                    ) : null}
                </Carousel>
                {count > 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
                        <span
                            className="rounded-full bg-black/60 px-3 py-1 text-xs text-white"
                            aria-live="polite"
                        >
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

/** The current slide plays or loads full resolution; the others show the preview. */
function LightboxSlide({
    item,
    scope,
    isCurrent,
}: {
    item: ChatAttachment;
    scope: ChatScope;
    isCurrent: boolean;
}) {
    if (item.mime.startsWith('video/')) {
        return isCurrent ? (
            <video
                src={chatAttachmentUrl(scope, item.id)}
                className="max-h-full max-w-full object-contain"
                controls
                autoPlay
                playsInline
            >
                {/* Chat attachments have no captions track available. */}
                <track kind="captions" />
            </video>
        ) : null;
    }

    if (!isCurrent) {
        return (
            <img
                src={chatAttachmentPreviewUrl(scope, item)}
                alt={item.name}
                className="max-h-full max-w-full object-contain opacity-50"
            />
        );
    }

    return <ChatMediaLightboxImage attachment={item} scope={scope} />;
}
