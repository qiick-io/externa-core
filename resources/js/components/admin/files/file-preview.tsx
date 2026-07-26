import { FolderOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { FileIcon, defaultStyles } from 'react-file-icon';
import { filePublicUrl, isImageFile, isPlayableVideo } from '@/lib/files-api';
import { cn } from '@/lib/utils';
import type { AdminFileRow } from '@/types/files';

type FilePreviewProps = {
    file: AdminFileRow;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    /** Grid cards pass hover so playable videos autoplay muted. */
    hovered?: boolean;
    /** Full-bleed media for grid cards (`object-cover`). Icon layout for folders / other types. */
    variant?: 'icon' | 'cover';
};

const sizeClass = {
    sm: 'size-12',
    md: 'size-16',
    lg: 'size-40',
};

/**
 * Thumbnail or icon preview for a file row.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function FilePreview({
    file,
    className,
    size = 'sm',
    hovered = false,
    variant = 'icon',
}: FilePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isCover = variant === 'cover';
    const boxClass = isCover
        ? cn('absolute inset-0 size-full overflow-hidden', className)
        : cn(
              sizeClass[size],
              'flex shrink-0 items-center justify-center overflow-hidden',
              className,
          );
    const mediaClass = isCover
        ? cn(
              'pointer-events-none absolute inset-0 size-full max-h-full max-w-full object-cover',
              className,
          )
        : cn(boxClass, 'rounded object-cover');

    useEffect(() => {
        const videoElement = videoRef.current;

        if (!videoElement) {
            return;
        }

        if (hovered) {
            void videoElement.play().catch(() => {
                // Autoplay can be blocked; metadata poster still shows.
            });

            return;
        }

        videoElement.pause();
        videoElement.currentTime = 0;
    }, [hovered]);

    if (file.type === 'folder') {
        return (
            <div className={boxClass}>
                <FolderOpen className="size-full text-amber-500" />
            </div>
        );
    }

    const publicUrl = filePublicUrl(file);

    if (isImageFile(file)) {
        const imageSrc = file.thumbnail_url ?? publicUrl;

        if (imageSrc) {
            return (
                <img
                    src={imageSrc}
                    alt={file.title || file.name}
                    className={mediaClass}
                />
            );
        }
    }

    if (publicUrl && isPlayableVideo(file)) {
        return (
            <video
                ref={videoRef}
                src={publicUrl}
                muted
                loop
                playsInline
                preload="metadata"
                className={mediaClass}
            />
        );
    }

    const extension = (
        file.extension ||
        file.name.split('.').pop() ||
        'file'
    ).toLowerCase();
    const style =
        defaultStyles[extension as keyof typeof defaultStyles] ??
        defaultStyles.txt;

    return (
        <div className={boxClass}>
            <div className="flex h-full w-full items-center justify-center [&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-full [&_svg]:max-w-full">
                <FileIcon extension={extension} {...style} />
            </div>
        </div>
    );
}

/** Whether the grid card can show a full-bleed image/video cover. */
export function hasCoverMedia(file: AdminFileRow): boolean {
    if (file.type === 'folder') {
        return false;
    }

    if (isImageFile(file)) {
        return Boolean(file.thumbnail_url ?? filePublicUrl(file));
    }

    return Boolean(filePublicUrl(file)) && isPlayableVideo(file);
}
