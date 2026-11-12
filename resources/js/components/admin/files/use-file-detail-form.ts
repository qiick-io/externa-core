import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FocalPoint } from '@/components/admin/files/focal-point-picker';
import { isImageFile, syncFileTags, updateFileMetadata } from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { AdminFileRow } from '@/types/files';

export type AccessChoice = 'inherit' | 'public' | 'private';

function accessChoiceFromFile(file: AdminFileRow): AccessChoice {
    if (file.access === null || file.access === undefined) {
        return 'inherit';
    }

    return file.access;
}

function accessPayload(choice: AccessChoice): 'public' | 'private' | null {
    if (choice === 'inherit') {
        return null;
    }

    return choice;
}

function focalPointFromFile(file: AdminFileRow): FocalPoint | null {
    return file.focal_point_x === null || file.focal_point_y === null
        ? null
        : { x: file.focal_point_x, y: file.focal_point_y };
}

type UseFileDetailFormOptions = {
    file: AdminFileRow;
    canUpdateMetadata: boolean;
    canTag: boolean;
    onUpdated: (file: AdminFileRow) => void;
};

/**
 * Editable metadata of the file detail panel (visibility, title, description,
 * location, download name, focal point, tags) and its save. The form reloads
 * whenever another file, or a fresh copy of the same one, is passed in.
 *
 * Saving sends the metadata when the user may update it, then syncs the tags
 * when the user may tag; the last server copy goes to `onUpdated`.
 * @param {UseFileDetailFormOptions} options - File, permissions and callback.
 */
export function useFileDetailForm({
    file,
    canUpdateMetadata,
    canTag,
    onUpdated,
}: UseFileDetailFormOptions) {
    const { t } = useTranslation();
    const hasFocalPoint = file.type === 'file' && isImageFile(file);
    const [title, setTitle] = useState(file.title ?? '');
    const [description, setDescription] = useState(file.description ?? '');
    const [location, setLocation] = useState(file.location ?? '');
    const [downloadName, setDownloadName] = useState(file.download_name ?? '');
    const [focalPoint, setFocalPoint] = useState<FocalPoint | null>(
        focalPointFromFile(file),
    );
    const [access, setAccess] = useState<AccessChoice>(
        accessChoiceFromFile(file),
    );
    const [tags, setTags] = useState(file.tags.map((tag) => tag.name));
    const [saving, setSaving] = useState(false);
    const [previousFile, setPreviousFile] = useState(file);

    // Reload the form during render when another file (or a fresh copy) arrives
    // (React's "adjust state on prop change" pattern).
    if (previousFile !== file) {
        setPreviousFile(file);
        setTitle(file.title ?? '');
        setDescription(file.description ?? '');
        setLocation(file.location ?? '');
        setDownloadName(file.download_name ?? '');
        setFocalPoint(focalPointFromFile(file));
        setAccess(accessChoiceFromFile(file));
        setTags(file.tags.map((tag) => tag.name));
    }

    const handleSave = async (): Promise<void> => {
        setSaving(true);

        try {
            let updated = file;

            if (canUpdateMetadata) {
                updated = await updateFileMetadata(file.id, {
                    title: title.trim() || null,
                    description: description.trim() || null,
                    location: location.trim() || null,
                    download_name: downloadName.trim() || null,
                    access: accessPayload(access),
                    // Only images carry a focal point. Translate / scale are
                    // no longer sent: nothing reads them (columns go in 1.5.0).
                    ...(hasFocalPoint
                        ? {
                              focal_point_x: focalPoint?.x ?? null,
                              focal_point_y: focalPoint?.y ?? null,
                          }
                        : {}),
                });
            }

            if (canTag) {
                updated = await syncFileTags(file.id, tags);
            }

            onUpdated(updated);
            toast.success(t('files.detail.updated'));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.detail.failedSave'),
            );
        } finally {
            setSaving(false);
        }
    };

    return {
        hasFocalPoint,
        title,
        setTitle,
        description,
        setDescription,
        location,
        setLocation,
        downloadName,
        setDownloadName,
        focalPoint,
        setFocalPoint,
        access,
        setAccess,
        tags,
        setTags,
        saving,
        handleSave,
    };
}

export type FileDetailForm = ReturnType<typeof useFileDetailForm>;
