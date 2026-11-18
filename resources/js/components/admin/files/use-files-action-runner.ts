import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { openAiWithPrompt, seedFilesBulkPrompt } from '@/lib/ai-open';
import {
    bulkFileAction,
    copyFile,
    downloadFileUrl,
    favoriteFile,
    queueFilesZipDownload,
    restoreFile,
    unfavoriteFile,
} from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { AdminFileRow, FileActionKey } from '@/types/files';

type UseFilesActionRunnerOptions = {
    selectedFiles: AdminFileRow[];
    clearSelection: () => void;
    parentId: number | null;
    isAiAvailable: boolean;
    refreshPage: () => void;
    trackPendingDuplication: (jobId: string) => void;
    trackPendingZip: (jobId: string) => void;
    openFileDetails: (file: AdminFileRow) => void;
    requestDestructive: (
        action: 'delete' | 'force_delete',
        targets: AdminFileRow[],
    ) => void;
    openMoveDialog: (targets: AdminFileRow[]) => void;
    openRenameDialog: (file: AdminFileRow) => void;
    openTagDialog: () => void;
};

/**
 * Runs a file action from the selection toolbar, a card menu or the context
 * menu, on the given targets or on the current selection.
 *
 * Single targets use the per-file endpoints, several targets the bulk endpoint;
 * duplications and multi-file downloads are queued and tracked as background
 * jobs. Deletes are only requested here and run after confirmation.
 */
export function useFilesActionRunner({
    selectedFiles,
    clearSelection,
    parentId,
    isAiAvailable,
    refreshPage,
    trackPendingDuplication,
    trackPendingZip,
    openFileDetails,
    requestDestructive,
    openMoveDialog,
    openRenameDialog,
    openTagDialog,
}: UseFilesActionRunnerOptions) {
    const { t } = useTranslation();

    return useCallback(
        async (
            action: FileActionKey,
            targets?: AdminFileRow[],
        ): Promise<void> => {
            const selected = targets ?? selectedFiles;

            if (selected.length === 0) {
                return;
            }

            const ids = selected.map((file) => file.id);

            if (action === 'delete' || action === 'force_delete') {
                requestDestructive(action, selected);

                return;
            }

            try {
                switch (action) {
                    case 'details':
                        if (selected[0]) {
                            openFileDetails(selected[0]);
                        }

                        break;
                    case 'download':
                        if (
                            selected.length === 1 &&
                            selected[0].type === 'file'
                        ) {
                            window.location.href = downloadFileUrl(
                                selected[0].id,
                            );
                        } else {
                            const result = await queueFilesZipDownload(ids);
                            toast.success(t('files.toasts.zipPreparing'));
                            trackPendingZip(result.job_id);
                            clearSelection();
                        }

                        break;
                    case 'move':
                        openMoveDialog(selected);
                        break;
                    case 'rename':
                        if (selected[0]) {
                            openRenameDialog(selected[0]);
                        }

                        break;
                    case 'duplicate': {
                        if (ids.length === 1) {
                            const result = await copyFile(ids[0], parentId);

                            if (result.queued) {
                                toast.success(
                                    t('files.toasts.duplicationStarted'),
                                );
                                trackPendingDuplication(result.job_id);
                            } else {
                                toast.success(t('files.toasts.duplicated'));
                                refreshPage();
                            }
                        } else {
                            const result = await bulkFileAction('copy', ids, {
                                parent_id: parentId,
                            });
                            toast.success(t('files.toasts.duplicationStarted'));

                            if (result.queued) {
                                trackPendingDuplication(result.job_id);
                            }
                        }

                        clearSelection();
                        break;
                    }
                    case 'favorite':
                        if (ids.length === 1) {
                            await favoriteFile(ids[0]);
                        } else {
                            await bulkFileAction('favorite', ids);
                        }

                        refreshPage();
                        break;
                    case 'unfavorite':
                        if (ids.length === 1) {
                            await unfavoriteFile(ids[0]);
                        } else {
                            await bulkFileAction('unfavorite', ids);
                        }

                        refreshPage();
                        break;
                    case 'replace':
                        if (selected[0]) {
                            openFileDetails(selected[0]);
                        }

                        break;
                    case 'tag':
                        openTagDialog();
                        break;
                    case 'ask_ai':
                        if (!isAiAvailable) {
                            break;
                        }

                        openAiWithPrompt(
                            seedFilesBulkPrompt(
                                selected.map((file) => ({
                                    id: file.id,
                                    name: file.name,
                                })),
                            ),
                        );
                        break;
                    case 'restore':
                        if (ids.length === 1) {
                            await restoreFile(ids[0]);
                        } else {
                            await bulkFileAction('restore', ids);
                        }

                        clearSelection();
                        refreshPage();
                        break;
                }
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t('files.toasts.actionFailed'),
                );
            }
        },
        [
            selectedFiles,
            clearSelection,
            parentId,
            isAiAvailable,
            refreshPage,
            trackPendingDuplication,
            trackPendingZip,
            openFileDetails,
            requestDestructive,
            openMoveDialog,
            openRenameDialog,
            openTagDialog,
            t,
        ],
    );
}
