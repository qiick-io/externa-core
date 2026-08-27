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
import type { ChatAttachment, ChatScope } from '@/lib/item-chat-api';
import { chatAttachmentUrl } from '@/lib/item-chat-api';

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
    const href = current ? chatAttachmentUrl(scope, current.id) : null;
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
                    {href && current ? (
                        isVideo ? (
                            <video
                                key={current.id}
                                src={href}
                                className="max-h-full max-w-full object-contain"
                                controls
                                autoPlay
                                playsInline
                            />
                        ) : (
                            <img
                                key={current.id}
                                src={href}
                                alt={current.name}
                                className="max-h-full max-w-full object-contain"
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
