import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePreview } from '@/components/admin/files/file-preview';
import { FocalPointPicker } from '@/components/admin/files/focal-point-picker';
import type { FocalPoint } from '@/components/admin/files/focal-point-picker';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import {
    filePublicUrl,
    isImageFile,
    isPlayableVideo,
    replaceFile,
} from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { AdminFileRow } from '@/types/files';

function DetailMediaPreview({ file }: { file: AdminFileRow }) {
    const publicUrl = filePublicUrl(file);

    if (publicUrl && isImageFile(file)) {
        return (
            <AspectRatio ratio={16 / 9} className="rounded bg-muted">
                <img
                    src={publicUrl}
                    alt={file.title || file.name}
                    className="size-full rounded object-contain"
                />
            </AspectRatio>
        );
    }

    if (publicUrl && isPlayableVideo(file)) {
        return (
            <AspectRatio ratio={16 / 9} className="rounded bg-black">
                <video
                    controls
                    preload="metadata"
                    src={publicUrl}
                    className="size-full rounded"
                >
                    {/* User-uploaded media has no captions track available. */}
                    <track kind="captions" />
                </video>
            </AspectRatio>
        );
    }

    return <FilePreview file={file} size="lg" />;
}

/** Extension for replace `<input accept>` — prefers `file.extension`, else parsed from name. */
function replaceAcceptAttribute(file: AdminFileRow): string | undefined {
    const fromField = file.extension?.replace(/^\./, '').trim().toLowerCase();

    if (fromField) {
        return `.${fromField}`;
    }

    const lastDot = file.name.lastIndexOf('.');

    if (lastDot > 0 && lastDot < file.name.length - 1) {
        return `.${file.name.slice(lastDot + 1).toLowerCase()}`;
    }

    // ponytail: no extension — mime type (or family) as a weak filter.
    if (file.mime_type) {
        const family = file.mime_type.split('/')[0];

        return family ? `${family}/*` : file.mime_type;
    }

    return undefined;
}

type FileDetailMediaProps = {
    file: AdminFileRow;
    hasFocalPoint: boolean;
    focalPoint: FocalPoint | null;
    onFocalPointChange: (focalPoint: FocalPoint | null) => void;
    canUpdateMetadata: boolean;
    canReplace: boolean;
    onUpdated: (file: AdminFileRow) => void;
};

/**
 * Top of the file detail panel: the focal point picker for images (a plain
 * preview otherwise) and the "replace file" upload, which keeps the file id
 * and sends the server copy to `onUpdated`.
 * @param {FileDetailMediaProps} props - Component props.
 * @returns {JSX.Element}
 */
export function FileDetailMedia({
    file,
    hasFocalPoint,
    focalPoint,
    onFocalPointChange,
    canUpdateMetadata,
    canReplace,
    onUpdated,
}: FileDetailMediaProps) {
    const { t } = useTranslation();
    const publicUrl = filePublicUrl(file);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const [replacing, setReplacing] = useState(false);

    const handleReplace = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const nextFile = event.target.files?.[0];
        event.target.value = '';

        if (!nextFile || !canReplace || file.type !== 'file') {
            return;
        }

        setReplacing(true);

        try {
            const updated = await replaceFile(file.id, nextFile);
            onUpdated(updated);
            toast.success(t('files.detail.replaced'));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.detail.failedReplace'),
            );
        } finally {
            setReplacing(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-3">
            {hasFocalPoint && publicUrl ? (
                <FocalPointPicker
                    src={publicUrl}
                    alt={file.title || file.name}
                    imageWidth={file.width}
                    imageHeight={file.height}
                    value={focalPoint}
                    disabled={!canUpdateMetadata}
                    onChange={onFocalPointChange}
                />
            ) : (
                <DetailMediaPreview file={file} />
            )}
            {canReplace && file.type === 'file' && (
                <>
                    <input
                        ref={replaceInputRef}
                        type="file"
                        accept={replaceAcceptAttribute(file)}
                        className="hidden"
                        onChange={(event) => {
                            void handleReplace(event);
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={replacing}
                        onClick={() => replaceInputRef.current?.click()}
                    >
                        {replacing
                            ? t('files.detail.replacing')
                            : t('files.detail.replaceFile')}
                    </Button>
                </>
            )}
        </div>
    );
}
