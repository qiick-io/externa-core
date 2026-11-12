import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveFile } from '@/lib/files-api';
import { toast } from '@/lib/toast';

type UseFilesDragMoveOptions = {
    canEdit: boolean;
    isTrashed: boolean;
    parentId: number | null;
    refreshPage: () => void;
};

/**
 * Moves files by dragging a card onto a folder card (into that folder) or onto
 * the empty grid (into the current folder), and highlights the folder under
 * the pointer.
 *
 * Returns the drag props of `FileGrid`. Moves need the edit permission and are
 * disabled in the trash; a folder is never moved into itself.
 */
export function useFilesDragMove({
    canEdit,
    isTrashed,
    parentId,
    refreshPage,
}: UseFilesDragMoveOptions) {
    const { t } = useTranslation();
    const [draggingFileId, setDraggingFileId] = useState<number | null>(null);
    const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(
        null,
    );

    const handleMoveToFolder = async (
        fileId: number,
        targetFolderId: number | null,
    ): Promise<void> => {
        if (!canEdit || isTrashed) {
            return;
        }

        try {
            await moveFile(fileId, targetFolderId);
            refreshPage();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.toasts.moveFailed'),
            );
        }
    };

    return {
        dropTargetFolderId,
        onDragStart: setDraggingFileId,
        onDragEnd: (): void => {
            setDraggingFileId(null);
            setDropTargetFolderId(null);
        },
        onDragOverFolder: setDropTargetFolderId,
        onDragLeaveFolder: (folderId: number): void => {
            if (dropTargetFolderId === folderId) {
                setDropTargetFolderId(null);
            }
        },
        onDropOnFolder: (folderId: number): void => {
            if (
                canEdit &&
                draggingFileId !== null &&
                draggingFileId !== folderId
            ) {
                void handleMoveToFolder(draggingFileId, folderId);
            }

            setDraggingFileId(null);
            setDropTargetFolderId(null);
        },
        onDropOnGrid: (): void => {
            if (canEdit && draggingFileId !== null) {
                void handleMoveToFolder(draggingFileId, parentId);
            }

            setDraggingFileId(null);
            setDropTargetFolderId(null);
        },
    };
}
