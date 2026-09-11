import { Play } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type ChatMediaAlbumItem = {
    key: string;
    src: string | null;
    isVideo: boolean;
    name: string;
};

/** Telegram-style N-up album shell — internal; use ChatMediaAlbum. */
function ChatMediaAlbumLayout({
    count,
    className,
    renderCell,
}: {
    count: number;
    className?: string;
    renderCell: (index: number, cellClassName: string) => ReactNode;
}) {
    if (count <= 0) {
        return null;
    }

    // Explicit width (not only min/max) so Bubble w-fit gets a real
    // intrinsic size — % width + min-w-0 parent collapses album for !mine.
    const shell = 'w-80 max-w-full shrink-0 overflow-hidden bg-black/20';

    if (count === 1) {
        return (
            <div
                className={cn(
                    'w-full max-w-sm min-w-[14rem] shrink-0 overflow-hidden bg-black/20',
                    className,
                )}
            >
                {renderCell(0, 'flex justify-center')}
            </div>
        );
    }

    if (count === 2) {
        return (
            <div className={cn('grid grid-cols-2', shell, className)}>
                {Array.from({ length: count }, (_, index) =>
                    renderCell(index, 'aspect-[3/4] max-h-64'),
                )}
            </div>
        );
    }

    if (count === 3) {
        return (
            <div
                className={cn(
                    'grid aspect-[4/5] max-h-80 grid-cols-2 grid-rows-2',
                    shell,
                    className,
                )}
            >
                {renderCell(0, 'row-span-2')}
                {renderCell(1, '')}
                {renderCell(2, '')}
            </div>
        );
    }

    if (count === 4) {
        return (
            <div className={cn('grid grid-cols-2', shell, className)}>
                {Array.from({ length: count }, (_, index) =>
                    renderCell(index, 'aspect-square max-h-44'),
                )}
            </div>
        );
    }

    // 5+: 2-up hero row + 3-up rows — separate grids avoid 6-col + max-h width shrink.
    return (
        <div className={cn(shell, className)}>
            <div className="grid grid-cols-2">
                {renderCell(0, 'aspect-[3/4] max-h-64')}
                {renderCell(1, 'aspect-[3/4] max-h-64')}
            </div>
            <div className="grid grid-cols-3">
                {Array.from({ length: count - 2 }, (_, index) =>
                    renderCell(index + 2, 'aspect-square max-h-36'),
                )}
            </div>
        </div>
    );
}

/** Same thumb markup as the bubble gallery cell. */
function ChatMediaAlbumThumb({
    href,
    isVideo,
    name,
    single,
}: {
    href: string;
    isVideo: boolean;
    name: string;
    single: boolean;
}) {
    const [loaded, setLoaded] = useState(false);

    return (
        <div
            className={cn(
                'relative h-full w-full bg-muted/70',
                single ? 'min-h-[10rem]' : 'min-h-[6rem]',
            )}
        >
            {!loaded ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            ) : null}
            {isVideo ? (
                <>
                    <video
                        src={href}
                        className={cn(
                            'h-full max-h-[22rem] w-full object-cover transition-opacity',
                            loaded ? 'opacity-100' : 'opacity-0',
                        )}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedData={() => setLoaded(true)}
                    />
                    {loaded ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white">
                                <Play className="size-5 fill-current" />
                            </span>
                        </span>
                    ) : null}
                </>
            ) : (
                <img
                    src={href}
                    alt={name}
                    className={cn(
                        'h-full w-full transition-opacity',
                        single
                            ? 'max-h-[22rem] object-contain'
                            : 'object-cover',
                        loaded ? 'opacity-100' : 'opacity-0',
                    )}
                    onLoad={() => setLoaded(true)}
                />
            )}
        </div>
    );
}

/**
 * Shared album used by sent bubble, send-attachments modal, and optimistic preview.
 * Overlays (menu / remove / progress) are slots — grid geometry stays one place.
 */
export function ChatMediaAlbum({
    items,
    className,
    mediaPreviewLabel,
    onMediaClick,
    renderOverlay,
}: {
    items: ChatMediaAlbumItem[];
    className?: string;
    mediaPreviewLabel?: string;
    onMediaClick?: (index: number) => void;
    renderOverlay?: (item: ChatMediaAlbumItem, index: number) => ReactNode;
}) {
    const count = items.length;

    return (
        <ChatMediaAlbumLayout
            count={count}
            className={className}
            renderCell={(index, cellClassName) => {
                const item = items[index]!;
                const media = item.src ? (
                    <ChatMediaAlbumThumb
                        href={item.src}
                        isVideo={item.isVideo}
                        name={item.name}
                        single={count === 1}
                    />
                ) : (
                    <div className="flex h-full min-h-[6rem] items-center justify-center overflow-hidden bg-muted/70 px-2 text-center text-xs break-all text-muted-foreground">
                        {item.name}
                    </div>
                );

                return (
                    <div
                        key={item.key}
                        className={cn(
                            'group/media relative min-h-0 min-w-0',
                            cellClassName,
                        )}
                    >
                        {onMediaClick ? (
                            <button
                                type="button"
                                className="relative block h-full w-full cursor-zoom-in"
                                aria-label={mediaPreviewLabel}
                                onClick={() => onMediaClick(index)}
                            >
                                {media}
                            </button>
                        ) : (
                            <div className="relative block h-full w-full">
                                {media}
                            </div>
                        )}
                        {renderOverlay?.(item, index)}
                    </div>
                );
            }}
        />
    );
}
