import { usePage } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
    addFileUpload,
    createUploadId,
    subscribeToFileUploads,
    updateFileUpload,
} from '@/lib/file-upload-store';
import {
    CHUNK_SIZE_BYTES,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import {
    collectFilesFromDataTransferItems,
    collectFilesFromFileList,
    ensureAllFolderPaths,
    ensureFolderPath,
    hasDirectoryInDataTransferItems,
    inferFolderUploadLabel,
    runWithConcurrencyLimit,
} from '@/lib/folder-upload';
import type { FileWithDirectoryPath } from '@/lib/folder-upload';
import { toast } from '@/lib/toast';
import type { FileUploadProgress } from '@/types/files';

type UseFilesUploadOptions = {
    parentId: number | null;
    uploadsEnabled: boolean;
    refreshPage: () => void;
};

/**
 * Uploads files and whole folders into the current folder of the file manager,
 * from the upload inputs and from drag-and-drop.
 *
 * Single files get one progress entry each; a folder upload recreates its
 * directory tree first and reports one batch entry (files and bytes) in the
 * shared upload store. Large files go through the chunked endpoint.
 */
export function useFilesUpload({
    parentId,
    uploadsEnabled,
    refreshPage,
}: UseFilesUploadOptions) {
    const { t } = useTranslation();
    const { projectSettings } = usePage().props;
    const filesMaxUploadBytes = projectSettings?.filesMaxUploadBytes ?? null;
    const [uploads, setUploads] = useState<FileUploadProgress[]>([]);

    useEffect(() => {
        return subscribeToFileUploads(setUploads);
    }, []);

    const enqueueUpload = useCallback(
        async (
            file: File,
            targetParentId: number | null = parentId,
            batchContext?: {
                batchUploadId: string;
                onFileComplete: () => void;
                onFileBytesUploaded: (bytes: number) => void;
            },
        ): Promise<boolean> => {
            const uploadId = createUploadId();
            const totalChunks = Math.max(
                1,
                Math.ceil(file.size / CHUNK_SIZE_BYTES),
            );
            const trackIndividually = !batchContext;

            if (trackIndividually) {
                addFileUpload({
                    uploadId,
                    fileName: file.name,
                    kind: 'file',
                    totalChunks,
                    uploadedChunks: 0,
                    status: 'uploading',
                });
            }

            try {
                let lastReportedBytes = 0;

                if (file.size > CHUNK_SIZE_BYTES) {
                    await uploadFileChunked(
                        file,
                        targetParentId,
                        (uploadedChunks, total, uploadedBytes) => {
                            const deltaBytes =
                                uploadedBytes - lastReportedBytes;
                            lastReportedBytes = uploadedBytes;

                            if (trackIndividually) {
                                updateFileUpload(uploadId, (entry) => ({
                                    ...entry,
                                    uploadedChunks,
                                    totalChunks: total,
                                    status: 'uploading',
                                }));
                            }

                            if (deltaBytes > 0) {
                                batchContext?.onFileBytesUploaded(deltaBytes);
                            }
                        },
                        filesMaxUploadBytes,
                    );
                } else {
                    await uploadFileDirect(
                        file,
                        targetParentId,
                        filesMaxUploadBytes,
                    );
                    batchContext?.onFileBytesUploaded(file.size);

                    if (trackIndividually) {
                        updateFileUpload(uploadId, (entry) => ({
                            ...entry,
                            uploadedChunks: 1,
                            totalChunks: 1,
                            status: 'uploading',
                        }));
                    }
                }

                batchContext?.onFileComplete();

                if (trackIndividually) {
                    updateFileUpload(uploadId, (entry) => ({
                        ...entry,
                        status: 'complete',
                        uploadedChunks: entry.totalChunks,
                    }));
                }

                return true;
            } catch (error) {
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : t('files.toasts.uploadFailed');

                if (batchContext) {
                    updateFileUpload(batchContext.batchUploadId, (entry) => ({
                        ...entry,
                        status: 'error',
                        error: errorMessage,
                    }));
                } else {
                    updateFileUpload(uploadId, (entry) => ({
                        ...entry,
                        status: 'error',
                        error: errorMessage,
                    }));
                }

                return false;
            }
        },
        [filesMaxUploadBytes, parentId, t],
    );

    const uploadFilesWithStructure = useCallback(
        async (filesToUpload: FileWithDirectoryPath[]): Promise<void> => {
            if (filesToUpload.length === 0) {
                return;
            }

            const isFolderUpload = filesToUpload.some(
                (entry) => entry.directoryPath.length > 0,
            );
            const batchUploadId = isFolderUpload ? createUploadId() : null;
            const totalBytes = filesToUpload.reduce(
                (sum, entry) => sum + entry.file.size,
                0,
            );
            let uploadedBytes = 0;
            let uploadedFiles = 0;

            if (batchUploadId) {
                addFileUpload({
                    uploadId: batchUploadId,
                    fileName: inferFolderUploadLabel(filesToUpload),
                    kind: 'batch',
                    totalChunks: filesToUpload.length,
                    uploadedChunks: 0,
                    totalFiles: filesToUpload.length,
                    uploadedFiles: 0,
                    totalBytes,
                    uploadedBytes: 0,
                    status: 'uploading',
                });
            }

            const directoryPaths = filesToUpload.map(
                (entry) => entry.directoryPath,
            );
            const folderIdByPath = await ensureAllFolderPaths(
                directoryPaths,
                parentId,
            );

            if (batchUploadId) {
                refreshPage();
            }

            let uploadedCount = 0;
            let hadUploadError = false;

            await runWithConcurrencyLimit(
                filesToUpload.map((entry) => async () => {
                    const targetParentId = entry.directoryPath
                        ? await ensureFolderPath(
                              entry.directoryPath,
                              parentId,
                              folderIdByPath,
                          )
                        : parentId;

                    const uploaded = await enqueueUpload(
                        entry.file,
                        targetParentId,
                        batchUploadId
                            ? {
                                  batchUploadId,
                                  onFileComplete: () => {
                                      uploadedFiles += 1;
                                      updateFileUpload(
                                          batchUploadId,
                                          (batchEntry) => ({
                                              ...batchEntry,
                                              uploadedFiles,
                                              uploadedChunks: uploadedFiles,
                                          }),
                                      );
                                  },
                                  onFileBytesUploaded: (deltaBytes) => {
                                      uploadedBytes = Math.min(
                                          totalBytes,
                                          uploadedBytes + deltaBytes,
                                      );
                                      updateFileUpload(
                                          batchUploadId,
                                          (batchEntry) => ({
                                              ...batchEntry,
                                              uploadedBytes,
                                          }),
                                      );
                                  },
                              }
                            : undefined,
                    );

                    if (uploaded) {
                        uploadedCount += 1;
                    } else {
                        hadUploadError = true;
                    }
                }),
            );

            if (batchUploadId && !hadUploadError) {
                updateFileUpload(batchUploadId, (entry) => ({
                    ...entry,
                    status: 'complete',
                    uploadedFiles: filesToUpload.length,
                    uploadedChunks: filesToUpload.length,
                    uploadedBytes: totalBytes,
                }));
            }

            if (uploadedCount > 0) {
                refreshPage();
            }
        },
        [enqueueUpload, parentId, refreshPage],
    );

    const handleFilesSelected = useCallback(
        (selected: FileList | File[]): void => {
            if (!uploadsEnabled) {
                return;
            }

            void uploadFilesWithStructure(collectFilesFromFileList(selected));
        },
        [uploadFilesWithStructure, uploadsEnabled],
    );

    const handleItemsDropped = useCallback(
        (items: DataTransferItemList): void => {
            if (!uploadsEnabled) {
                return;
            }

            void (async () => {
                try {
                    if (hasDirectoryInDataTransferItems(items)) {
                        const filesToUpload =
                            await collectFilesFromDataTransferItems(items);
                        await uploadFilesWithStructure(filesToUpload);

                        return;
                    }

                    const filesToUpload =
                        await collectFilesFromDataTransferItems(items);

                    if (filesToUpload.length > 0) {
                        await uploadFilesWithStructure(filesToUpload);
                    }
                } catch (error) {
                    toast.error(
                        error instanceof Error
                            ? error.message
                            : t('files.toasts.dropFailed'),
                    );
                }
            })();
        },
        [uploadFilesWithStructure, uploadsEnabled, t],
    );

    const handleUploadInputChange = (
        event: ChangeEvent<HTMLInputElement>,
    ): void => {
        const selectedFiles = event.target.files;

        if (selectedFiles && selectedFiles.length > 0) {
            handleFilesSelected(selectedFiles);
        }

        event.target.value = '';
    };

    return {
        uploads,
        handleFilesSelected,
        handleItemsDropped,
        handleUploadInputChange,
    };
}
