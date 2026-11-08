import {
    File,
    FileArchive,
    FileAudio,
    FileCode,
    FileImage,
    FileSpreadsheet,
    FileText,
    FileVideo,
    FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createElement, useEffect, useRef, useState } from 'react';
import { withSearchParam } from '@/lib/file-field-image';
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

/** Grid cover ~2× typical card CSS px; matches FileTransformService::MAX_SIZE / card preset. */
const GRID_COVER_THUMB_SIZE = 512;

const EXTENSION_ICONS: Record<string, LucideIcon> = {
    // Documents
    pdf: FileText,
    txt: FileText,
    md: FileText,
    rtf: FileText,
    doc: FileText,
    docx: FileText,
    odt: FileText,
    pages: FileText,
    // Spreadsheets
    csv: FileSpreadsheet,
    xls: FileSpreadsheet,
    xlsx: FileSpreadsheet,
    ods: FileSpreadsheet,
    numbers: FileSpreadsheet,
    // Archives
    zip: FileArchive,
    rar: FileArchive,
    '7z': FileArchive,
    tar: FileArchive,
    gz: FileArchive,
    tgz: FileArchive,
    bz2: FileArchive,
    // Audio
    mp3: FileAudio,
    wav: FileAudio,
    flac: FileAudio,
    aac: FileAudio,
    m4a: FileAudio,
    ogg: FileAudio,
    // Video
    mp4: FileVideo,
    mov: FileVideo,
    webm: FileVideo,
    mkv: FileVideo,
    avi: FileVideo,
    m4v: FileVideo,
    // Images (fallback when no thumbnail URL)
    png: FileImage,
    jpg: FileImage,
    jpeg: FileImage,
    gif: FileImage,
    webp: FileImage,
    svg: FileImage,
    avif: FileImage,
    // Code
    js: FileCode,
    jsx: FileCode,
    ts: FileCode,
    tsx: FileCode,
    json: FileCode,
    html: FileCode,
    css: FileCode,
    scss: FileCode,
    php: FileCode,
    py: FileCode,
    rb: FileCode,
    go: FileCode,
    rs: FileCode,
    java: FileCode,
    xml: FileCode,
    yml: FileCode,
    yaml: FileCode,
    sh: FileCode,
    sql: FileCode,
};

/**
 * Picks a Lucide file glyph for an extension (tinted tile fallback when media is unavailable).
 */
export function fileIconForExtension(extension: string): LucideIcon {
    return EXTENSION_ICONS[extension.toLowerCase()] ?? File;
}

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
    // A thumbnail that fails to load (undecodable upload) falls back to the type icon.
    const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
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
    // Covers crop around the focal point set in the detail panel (0–1 scale).
    const mediaStyle =
        isCover &&
        typeof file.focal_point_x === 'number' &&
        typeof file.focal_point_y === 'number'
            ? {
                  objectPosition: `${file.focal_point_x * 100}% ${file.focal_point_y * 100}%`,
              }
            : undefined;

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
        const thumb = file.thumbnail_url ?? null;
        const imageSrc = thumb
            ? isCover
                ? withSearchParam(thumb, 'size', String(GRID_COVER_THUMB_SIZE))
                : thumb
            : publicUrl;

        if (imageSrc && imageSrc !== failedImageSrc) {
            return (
                <img
                    src={imageSrc}
                    alt={file.title || file.name}
                    className={mediaClass}
                    style={mediaStyle}
                    onError={() => setFailedImageSrc(imageSrc)}
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
                style={mediaStyle}
            />
        );
    }

    const extension = (
        file.extension ||
        file.name.split('.').pop() ||
        'file'
    ).toLowerCase();
    const Icon = fileIconForExtension(extension);

    return (
        <div
            className={cn(
                boxClass,
                isCover
                    ? 'flex items-center justify-center bg-muted text-muted-foreground'
                    : 'rounded-md bg-muted text-muted-foreground',
            )}
            data-testid="file-preview-icon"
        >
            {createElement(Icon, {
                className: cn(
                    isCover
                        ? 'size-1/3'
                        : size === 'lg'
                          ? 'size-16'
                          : 'size-1/2',
                    'max-h-full max-w-full',
                ),
                'aria-hidden': true,
            })}
        </div>
    );
}
