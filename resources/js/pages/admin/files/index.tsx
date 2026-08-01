import { Head, router } from '@inertiajs/react';
import {
    ArrowDownAZ,
    ArrowUpAZ,
    ChevronDown,
    Files,
    FolderOpen,
    FolderPlus,
    Trash2,
    Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { FileDropzone } from '@/components/admin/file-dropzone';
import { FileNameDialog } from '@/components/admin/file-name-dialog';
import { FileUploadIndicator } from '@/components/admin/file-upload-indicator';
import {
    resolveContextMenuTargets,
    resolveFileActions,
} from '@/components/admin/files/file-actions';
import type { FileActionPermissions } from '@/components/admin/files/file-actions';
import { FileDetailPanel } from '@/components/admin/files/file-detail-panel';
import { FileGrid } from '@/components/admin/files/file-grid';
import { FilesSelectionToolbar } from '@/components/admin/files/files-selection-toolbar';
import { FolderPickerDialog } from '@/components/admin/files/folder-picker-dialog';
import { TagFilterPopover } from '@/components/admin/files/tag-filter-popover';
import { TagPicker } from '@/components/admin/files/tag-picker';
import { useFilesSelection } from '@/components/admin/files/use-files-selection';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import { useRegisterActiveUploads } from '@/hooks/use-register-active-uploads';
import AppLayout from '@/layouts/app-layout';
import { getQueryParam, patchLocationQuery } from '@/lib/admin-query-params';
import adminRoutes from '@/lib/admin-routes';
import { openAiWithPrompt, seedFilesBulkPrompt } from '@/lib/ai-open';
import {
    addFileUpload,
    createUploadId,
    dismissAllFileUploads,
    removeFileUpload,
    subscribeToFileUploads,
    updateFileUpload,
} from '@/lib/file-upload-store';
import {
    CHUNK_SIZE_BYTES,
    bulkFileAction,
    copyFile,
    createFolder,
    deleteFile,
    downloadFileUrl,
    downloadPreparedZipUrl,
    favoriteFile,
    fetchFileWhereUsed,
    fetchFilesByIds,
    forceDeleteFile,
    listFileTagsCatalog,
    listFilesPage,
    moveFile,
    queueFilesZipDownload,
    renameFile,
    restoreFile,
    unfavoriteFile,
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
import {
    fetchNotifications,
    notifyNotificationsUpdated,
} from '@/lib/notifications-api';
import { toast } from '@/lib/toast';
import type { BreadcrumbItem } from '@/types';
import type {
    AdminFileRow,
    FileActionKey,
    FileBreadcrumb,
    FileTag,
    FilesPaginator,
    FileUploadProgress,
} from '@/types/files';

type FileSortField = 'name' | 'size' | 'created_at' | 'updated_at';
type FileSortDirection = 'asc' | 'desc';

type FileFilters = {
    trashed?: 'only' | 'with' | null;
    tag_ids?: number[];
    sort?: FileSortField;
    direction?: FileSortDirection;
};

const FILE_SORT_FIELDS: { value: FileSortField; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'size', label: 'Size' },
    { value: 'created_at', label: 'Created' },
    { value: 'updated_at', label: 'Updated' },
];

// ponytail: no websockets — poll notifications while duplication jobs are pending.
const BACKGROUND_JOB_POLL_INTERVAL_MS = 2_500;

/**
 * Admin file manager with grid, uploads, and bulk actions.
 * @param {*} props.files - files.
 * @param {*} props.breadcrumbs - breadcrumbs.
 * @returns {JSX.Element}
 */
export default function AdminFilesIndex({
    files: initialFiles,
    parentId = null,
    breadcrumbs: initialBreadcrumbs = [],
    filters = {},
}: {
    files: FilesPaginator;
    parentId?: number | null;
    breadcrumbs?: FileBreadcrumb[];
    filters?: FileFilters;
}) {
    const { can } = useCan();
    useRegisterActiveUploads();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState(initialFiles.data);
    const [page, setPage] = useState(initialFiles.current_page);
    const [lastPage, setLastPage] = useState(initialFiles.last_page);
    const [loadingMore, setLoadingMore] = useState(false);
    // ponytail: ref lock + generation beat double-click / stale load-more races
    const loadingMoreRef = useRef(false);
    const listGenerationRef = useRef(0);
    const [search, setSearch] = useState('');
    const [detailFile, setDetailFile] = useState<AdminFileRow | null>(null);
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renameTargetFile, setRenameTargetFile] =
        useState<AdminFileRow | null>(null);
    const [tagDialogOpen, setTagDialogOpen] = useState(false);
    const [bulkTags, setBulkTags] = useState<string[]>([]);
    const [tagCatalog, setTagCatalog] = useState<FileTag[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
        filters.tag_ids ?? [],
    );
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [moveTargetFiles, setMoveTargetFiles] = useState<AdminFileRow[]>([]);
    const [uploads, setUploads] = useState<FileUploadProgress[]>([]);
    const [draggingFileId, setDraggingFileId] = useState<number | null>(null);
    const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(
        null,
    );
    const [trashed, setTrashed] = useState<'active' | 'trashed'>(
        filters.trashed === 'only' ? 'trashed' : 'active',
    );
    const [sort, setSort] = useState<FileSortField>(filters.sort ?? 'name');
    const [direction, setDirection] = useState<FileSortDirection>(
        filters.direction ?? 'asc',
    );
    const pendingDuplicationJobIdsRef = useRef(new Set<string>());
    const [pendingDuplicationJobCount, setPendingDuplicationJobCount] =
        useState(0);
    const pendingZipJobIdsRef = useRef(new Set<string>());
    const [pendingZipJobCount, setPendingZipJobCount] = useState(0);
    const [pendingDestructive, setPendingDestructive] = useState<{
        action: 'delete' | 'force_delete';
        targets: AdminFileRow[];
    } | null>(null);
    const [destructiveRefCount, setDestructiveRefCount] = useState(0);
    const [destructiveRefLoading, setDestructiveRefLoading] = useState(false);
    const [confirmingDestructive, setConfirmingDestructive] = useState(false);

    const canCreate = can(PermissionEnum.CanCreateFiles);
    const canEdit = can(PermissionEnum.CanEditFiles);
    const canDelete = can(PermissionEnum.CanDeleteFiles);
    const canRestore = can(PermissionEnum.CanRestoreFiles);
    const canForceDelete = can(PermissionEnum.CanForceDeleteFiles);
    const canDownload = can(PermissionEnum.CanDownloadFiles);
    const canFavorite = can(PermissionEnum.CanFavoriteFiles);
    const canCopy = can(PermissionEnum.CanCopyFiles);
    const canReplace = can(PermissionEnum.CanReplaceFiles);
    const canTag = can(PermissionEnum.CanTagFiles);
    const canUpdateMetadata = can(PermissionEnum.CanUpdateFileMetadata);
    const canUseAi = can(PermissionEnum.CanUseAi);
    const isTrashed = trashed === 'trashed';
    const uploadsEnabled = canCreate && !isTrashed;

    const selectionResetKey = `${parentId ?? 'root'}:${trashed}:${selectedTagIds.join(',')}`;
    const selection = useFilesSelection(files, selectionResetKey);

    const clearSelectionAndDetail = useCallback((): void => {
        selection.clearSelection();
        setDetailFile(null);
    }, [selection.clearSelection]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape') {
                return;
            }

            if (
                folderDialogOpen ||
                renameDialogOpen ||
                tagDialogOpen ||
                moveDialogOpen
            ) {
                return;
            }

            clearSelectionAndDetail();
        };

        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('keydown', handleEscape);
        };
    }, [
        clearSelectionAndDetail,
        folderDialogOpen,
        moveDialogOpen,
        renameDialogOpen,
        tagDialogOpen,
    ]);

    const actionPermissions: FileActionPermissions = useMemo(
        () => ({
            canEdit,
            canDelete,
            canRestore,
            canForceDelete,
            canDownload,
            canFavorite,
            canCopy,
            canReplace,
            canTag,
            canUpdateMetadata,
            canUseAi,
        }),
        [
            canEdit,
            canDelete,
            canRestore,
            canForceDelete,
            canDownload,
            canFavorite,
            canCopy,
            canReplace,
            canTag,
            canUpdateMetadata,
            canUseAi,
        ],
    );

    const applyServerPage = useCallback((paginator: FilesPaginator): void => {
        listGenerationRef.current += 1;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setFiles(paginator.data);
        setPage(paginator.current_page);
        setLastPage(paginator.last_page);
    }, []);

    const beginListFilterVisit = useCallback((): void => {
        // Invalidate load-more and hide the button until page-1 props arrive.
        // Keep current cards visible to avoid an empty-folder flash mid-visit.
        listGenerationRef.current += 1;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setPage(1);
        setLastPage(1);
    }, []);

    useEffect(() => {
        if (search.trim() !== '') {
            return;
        }

        applyServerPage(initialFiles);
    }, [applyServerPage, initialFiles, search]);

    useEffect(() => {
        const term = search.trim();

        if (term === '') {
            return;
        }

        const requestGeneration = listGenerationRef.current + 1;
        listGenerationRef.current = requestGeneration;
        loadingMoreRef.current = false;
        setLoadingMore(false);

        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    const next = await listFilesPage({
                        parentId,
                        trashed: isTrashed ? 'only' : null,
                        page: 1,
                        search: term,
                        tagIds: selectedTagIds,
                        sort,
                        direction,
                    });

                    if (requestGeneration !== listGenerationRef.current) {
                        return;
                    }

                    setFiles(next.data);
                    setPage(next.current_page);
                    setLastPage(next.last_page);
                } catch (error) {
                    if (requestGeneration !== listGenerationRef.current) {
                        return;
                    }

                    toast.error(
                        error instanceof Error
                            ? error.message
                            : 'Failed to search files',
                    );
                }
            })();
        }, 300);

        return () => {
            window.clearTimeout(timer);
        };
    }, [direction, isTrashed, parentId, search, selectedTagIds, sort]);

    useEffect(() => {
        setSelectedTagIds(filters.tag_ids ?? []);
    }, [filters.tag_ids]);

    useEffect(() => {
        setSort(filters.sort ?? 'name');
        setDirection(filters.direction ?? 'asc');
    }, [filters.sort, filters.direction]);

    useEffect(() => {
        return subscribeToFileUploads(setUploads);
    }, []);

    useEffect(() => {
        let cancelled = false;

        void listFileTagsCatalog()
            .then((tags) => {
                if (!cancelled) {
                    setTagCatalog(tags);
                }
            })
            .catch(() => {
                // Catalog is best-effort for picker/filter; listing still works.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const refreshTagCatalog = useCallback(async (): Promise<void> => {
        try {
            setTagCatalog(await listFileTagsCatalog());
        } catch {
            // Ignore catalog refresh failures.
        }
    }, []);

    const pageBreadcrumbs: BreadcrumbItem[] = useMemo(() => {
        const listQuery: Record<string, string | number | number[]> = {
            sort,
            direction,
        };

        if (selectedTagIds.length > 0) {
            listQuery.tag_ids = selectedTagIds;
        }

        const crumbs: BreadcrumbItem[] = [
            {
                title: 'Files',
                href: adminRoutes.files.index({ query: listQuery }),
            },
        ];

        if (!isTrashed) {
            for (const crumb of initialBreadcrumbs) {
                crumbs.push({
                    title: crumb.name,
                    href: adminRoutes.files.index(crumb.id, {
                        query: listQuery,
                    }),
                });
            }
        }

        return crumbs;
    }, [direction, initialBreadcrumbs, isTrashed, selectedTagIds, sort]);

    const refreshPage = useCallback(() => {
        // Invalidate in-flight load-more before Inertia replaces page 1.
        listGenerationRef.current += 1;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        // Inertia reload always preserves scroll/state; those options were removed from ReloadOptions.
        router.reload({
            only: ['files'],
        });
    }, []);

    const trackPendingDuplication = useCallback((jobId: string) => {
        pendingDuplicationJobIdsRef.current.add(jobId);
        setPendingDuplicationJobCount(pendingDuplicationJobIdsRef.current.size);
    }, []);

    const trackPendingZip = useCallback((jobId: string) => {
        pendingZipJobIdsRef.current.add(jobId);
        setPendingZipJobCount(pendingZipJobIdsRef.current.size);
    }, []);

    useEffect(() => {
        if (pendingDuplicationJobCount === 0 && pendingZipJobCount === 0) {
            return;
        }

        let cancelled = false;

        const pollPendingJobs = async (): Promise<void> => {
            try {
                const payload = await fetchNotifications(1);

                if (cancelled) {
                    return;
                }

                const pendingDuplicationJobIds =
                    pendingDuplicationJobIdsRef.current;
                const pendingZipJobIds = pendingZipJobIdsRef.current;
                let resolvedDuplication = false;
                let resolvedZip = false;

                for (const notification of payload.data) {
                    const jobId = notification.data.job_id;

                    if (typeof jobId !== 'string') {
                        continue;
                    }

                    if (pendingDuplicationJobIds.has(jobId)) {
                        pendingDuplicationJobIds.delete(jobId);
                        resolvedDuplication = true;

                        if (
                            notification.data.type ===
                            'file_duplication_completed'
                        ) {
                            toast.success(
                                notification.data.title ??
                                    'File duplication completed',
                            );
                            refreshPage();
                        } else if (
                            notification.data.type === 'file_duplication_failed'
                        ) {
                            toast.error(
                                notification.data.title ??
                                    'File duplication failed',
                            );
                        }
                    }

                    if (pendingZipJobIds.has(jobId)) {
                        pendingZipJobIds.delete(jobId);
                        resolvedZip = true;

                        if (notification.data.type === 'file_zip_ready') {
                            const downloadUrl =
                                typeof notification.data.download_url ===
                                'string'
                                    ? notification.data.download_url
                                    : downloadPreparedZipUrl(jobId);

                            toast.success(
                                notification.data.title ?? 'Your zip is ready',
                                {
                                    action: {
                                        label: 'Download',
                                        onClick: () => {
                                            window.location.href = downloadUrl;
                                        },
                                    },
                                },
                            );
                        } else if (
                            notification.data.type === 'file_zip_failed'
                        ) {
                            toast.error(
                                notification.data.title ??
                                    'Zip preparation failed',
                            );
                        }
                    }
                }

                if (resolvedDuplication) {
                    setPendingDuplicationJobCount(
                        pendingDuplicationJobIds.size,
                    );
                }

                if (resolvedZip) {
                    setPendingZipJobCount(pendingZipJobIds.size);
                }

                if (resolvedDuplication || resolvedZip) {
                    notifyNotificationsUpdated();
                }
            } catch {
                // Ignore transient poll failures while jobs are pending.
            }
        };

        void pollPendingJobs();
        const intervalId = window.setInterval(() => {
            void pollPendingJobs();
        }, BACKGROUND_JOB_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [pendingDuplicationJobCount, pendingZipJobCount, refreshPage]);

    const buildFilesIndexUrl = useCallback(
        (
            options: {
                folderId?: number | null;
                nextTrashed?: 'active' | 'trashed';
                nextTagIds?: number[];
                nextSort?: FileSortField;
                nextDirection?: FileSortDirection;
            } = {},
        ): string => {
            const folderId =
                options.folderId !== undefined ? options.folderId : parentId;
            const nextTrashed = options.nextTrashed ?? trashed;
            const nextTagIds = options.nextTagIds ?? selectedTagIds;
            const nextSort = options.nextSort ?? sort;
            const nextDirection = options.nextDirection ?? direction;
            const query: Record<
                string,
                string | number | number[] | undefined
            > = {
                trashed: nextTrashed === 'trashed' ? 'only' : undefined,
                tag_ids: nextTagIds.length > 0 ? nextTagIds : undefined,
                sort: nextSort,
                direction: nextDirection,
            };

            if (nextTrashed === 'trashed' || folderId === null) {
                return adminRoutes.files.index({ query });
            }

            return adminRoutes.files.index(folderId, { query });
        },
        [direction, parentId, selectedTagIds, sort, trashed],
    );

    const navigateToFolder = (folderId: number | null): void => {
        if (isTrashed) {
            return;
        }

        router.get(buildFilesIndexUrl({ folderId }));
    };

    const visitWithTrashed = (nextTrashed: 'active' | 'trashed'): void => {
        setTrashed(nextTrashed);
        beginListFilterVisit();

        router.get(
            buildFilesIndexUrl({ nextTrashed }),
            {},
            { preserveState: true, preserveScroll: true },
        );
    };

    const visitWithTagFilter = (nextTagIds: number[]): void => {
        setSelectedTagIds(nextTagIds);
        beginListFilterVisit();

        router.get(
            buildFilesIndexUrl({ nextTagIds }),
            {},
            { preserveState: true, preserveScroll: true },
        );
    };

    const visitWithSort = (
        nextSort: FileSortField,
        nextDirection: FileSortDirection,
    ): void => {
        setSort(nextSort);
        setDirection(nextDirection);
        beginListFilterVisit();

        router.get(
            buildFilesIndexUrl({ nextSort, nextDirection }),
            {},
            { preserveState: true, preserveScroll: true },
        );
    };

    const toolbarActions = useMemo(
        () =>
            resolveFileActions(
                selection.selectedFiles,
                actionPermissions,
                isTrashed,
            ),
        [selection.selectedFiles, actionPermissions, isTrashed],
    );

    const loadMore = useCallback(async (): Promise<void> => {
        if (loadingMoreRef.current || page >= lastPage) {
            return;
        }

        const requestGeneration = listGenerationRef.current;
        const nextPage = page + 1;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        try {
            const next = await listFilesPage({
                parentId,
                trashed: isTrashed ? 'only' : null,
                page: nextPage,
                search: search.trim() || undefined,
                tagIds: selectedTagIds,
                sort,
                direction,
            });

            if (requestGeneration !== listGenerationRef.current) {
                return;
            }

            setFiles((current) => {
                const seenIds = new Set(current.map((file) => file.id));
                const appended = next.data.filter(
                    (file) => !seenIds.has(file.id),
                );

                return appended.length === 0
                    ? current
                    : [...current, ...appended];
            });
            setPage(next.current_page);
            setLastPage(next.last_page);
        } catch (error) {
            if (requestGeneration !== listGenerationRef.current) {
                return;
            }

            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Failed to load more files',
            );
        } finally {
            if (requestGeneration === listGenerationRef.current) {
                loadingMoreRef.current = false;
                setLoadingMore(false);
            }
        }
    }, [
        direction,
        isTrashed,
        lastPage,
        page,
        parentId,
        search,
        selectedTagIds,
        sort,
    ]);

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
                    );
                } else {
                    await uploadFileDirect(file, targetParentId);
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
                    error instanceof Error ? error.message : 'Upload failed';

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
        [parentId],
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
                            : 'Failed to process dropped files',
                    );
                }
            })();
        },
        [uploadFilesWithStructure, uploadsEnabled],
    );

    const handleUploadInputChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ): void => {
        const selectedFiles = event.target.files;

        if (selectedFiles && selectedFiles.length > 0) {
            handleFilesSelected(selectedFiles);
        }

        event.target.value = '';
    };

    const handleCreateFolder = async (name: string): Promise<void> => {
        await createFolder(name, parentId);
        refreshPage();
    };

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
                error instanceof Error ? error.message : 'Failed to move file',
            );
        }
    };

    const openFileDetails = (file: AdminFileRow): void => {
        setDetailFile(file);
        selection.selectOnly(file.id);
        patchLocationQuery({ file: String(file.id) });
    };

    const closeFileDetails = (): void => {
        setDetailFile(null);
        patchLocationQuery({ file: null });
    };

    const fileDeepLinkBooted = useRef(false);

    useEffect(() => {
        if (fileDeepLinkBooted.current || isTrashed) {
            return;
        }

        fileDeepLinkBooted.current = true;
        const raw = getQueryParam(
            window.location.pathname + window.location.search,
            'file',
        );
        const id = raw ? Number.parseInt(raw, 10) : NaN;

        if (!Number.isFinite(id) || id <= 0) {
            return;
        }

        const local = files.find((f) => f.id === id);

        if (local) {
            setDetailFile(local);
            selection.selectOnly(local.id);

            return;
        }

        void fetchFilesByIds([id]).then((rows) => {
            const row = rows[0];

            if (!row) {
                patchLocationQuery({ file: null });

                return;
            }

            setDetailFile(row);
            selection.selectOnly(row.id);
        });
        // Boot once from URL; selection/files identity changes intentionally ignored
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openRenameDialog = (file: AdminFileRow): void => {
        setRenameTargetFile(file);
        setRenameDialogOpen(true);
    };

    const handleRenameFile = async (name: string): Promise<void> => {
        if (!renameTargetFile) {
            return;
        }

        await renameFile(renameTargetFile.id, name);
        refreshPage();
    };

    const runAction = useCallback(
        async (
            action: FileActionKey,
            targets?: AdminFileRow[],
        ): Promise<void> => {
            const selected = targets ?? selection.selectedFiles;

            if (selected.length === 0) {
                return;
            }

            const ids = selected.map((file) => file.id);

            if (action === 'delete' || action === 'force_delete') {
                setPendingDestructive({ action, targets: selected });
                setDestructiveRefCount(0);
                const fileTargets = selected.filter((f) => f.type === 'file');
                if (fileTargets.length > 0 && fileTargets.length <= 10) {
                    setDestructiveRefLoading(true);
                    void Promise.all(
                        fileTargets.map((f) =>
                            fetchFileWhereUsed(f.id)
                                .then((r) => r.count)
                                .catch(() => 0),
                        ),
                    )
                        .then((counts) => {
                            setDestructiveRefCount(
                                counts.reduce((sum, n) => sum + n, 0),
                            );
                        })
                        .finally(() => setDestructiveRefLoading(false));
                }
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
                            toast.success(
                                "Preparing zip — you'll be notified when it's ready.",
                            );
                            trackPendingZip(result.job_id);
                            selection.clearSelection();
                        }

                        break;
                    case 'move':
                        setMoveTargetFiles(selected);
                        setMoveDialogOpen(true);
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
                                    "Duplication started — you'll be notified when it finishes",
                                );
                                trackPendingDuplication(result.job_id);
                            } else {
                                toast.success('File duplicated');
                                refreshPage();
                            }
                        } else {
                            const result = await bulkFileAction('copy', ids, {
                                parent_id: parentId,
                            });
                            toast.success(
                                "Duplication started — you'll be notified when it finishes",
                            );

                            if (result.queued) {
                                trackPendingDuplication(result.job_id);
                            }
                        }

                        selection.clearSelection();
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
                        setTagDialogOpen(true);
                        break;
                    case 'ask_ai':
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

                        selection.clearSelection();
                        refreshPage();
                        break;
                }
            } catch (error) {
                toast.error(
                    error instanceof Error ? error.message : 'Action failed',
                );
            }
        },
        [parentId, refreshPage, selection, trackPendingDuplication],
    );

    const executePendingDestructive = async (): Promise<void> => {
        if (!pendingDestructive) {
            return;
        }

        const { action, targets } = pendingDestructive;
        const ids = targets.map((file) => file.id);

        setConfirmingDestructive(true);

        try {
            if (action === 'delete') {
                if (ids.length === 1) {
                    await deleteFile(ids[0]);
                } else {
                    await bulkFileAction('delete', ids);
                }

                selection.clearSelection();
                setDetailFile(null);
                refreshPage();
            } else {
                if (ids.length === 1) {
                    await forceDeleteFile(ids[0]);
                } else {
                    await bulkFileAction('force_delete', ids);
                }

                selection.clearSelection();
                setDetailFile(null);
                refreshPage();
            }

            setPendingDestructive(null);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Action failed',
            );
        } finally {
            setConfirmingDestructive(false);
        }
    };

    const destructiveCount = pendingDestructive?.targets.length ?? 0;
    const destructiveIsForce =
        pendingDestructive?.action === 'force_delete';

    const resetBulkTagDialog = (): void => {
        setBulkTags([]);
    };

    const applyBulkTags = async (): Promise<void> => {
        if (bulkTags.length === 0 || selection.selectedIds.length === 0) {
            return;
        }

        try {
            await bulkFileAction('tag', selection.selectedIds, {
                tags: bulkTags,
            });
            setTagDialogOpen(false);
            resetBulkTagDialog();
            await refreshTagCatalog();
            refreshPage();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Failed to tag files',
            );
        }
    };

    const blockedMoveFolders = useMemo(
        () =>
            moveTargetFiles
                .filter((file) => file.type === 'folder')
                .map((folder) => ({ id: folder.id, path: folder.path })),
        [moveTargetFiles],
    );

    const handleConfirmMove = async (
        targetParentId: number | null,
    ): Promise<void> => {
        const ids = moveTargetFiles.map((file) => file.id);

        if (ids.length === 0) {
            return;
        }

        await bulkFileAction('move', ids, {
            parent_id: targetParentId,
        });
        selection.clearSelection();
        setMoveTargetFiles([]);
        refreshPage();
    };

    return (
        <AppLayout
            breadcrumbs={pageBreadcrumbs}
            headerActions={
                <>
                    {canCreate && !isTrashed && (
                        <Button
                            type="button"
                            onClick={() => setFolderDialogOpen(true)}
                        >
                            <FolderPlus className="mr-1 size-4" />
                            New folder
                        </Button>
                    )}
                    {uploadsEnabled && (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleUploadInputChange}
                            />
                            <input
                                ref={folderInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                {...({
                                    webkitdirectory: '',
                                } as React.InputHTMLAttributes<HTMLInputElement>)}
                                onChange={handleUploadInputChange}
                            />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button type="button">
                                        <Upload className="mr-1 size-4" />
                                        Upload
                                        <ChevronDown className="ml-1 size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                    >
                                        <Upload className="size-4" />
                                        Upload file
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            folderInputRef.current?.click()
                                        }
                                    >
                                        <FolderOpen className="size-4" />
                                        Upload folder
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </>
            }
        >
            <Head title="Files" />

            <FileDropzone
                disabled={!uploadsEnabled}
                onFilesSelected={handleFilesSelected}
                onItemsDropped={handleItemsDropped}
                className="min-h-0 flex-1"
            >
                <div className="flex min-h-0 flex-1">
                    <PageLayout
                        className="min-h-0 min-w-0 flex-1"
                        filters={
                            selection.selectedIds.length > 0 ? (
                                <div className="flex min-w-0 items-center gap-2">
                                    <FilesSelectionToolbar
                                        count={selection.selectedIds.length}
                                        actions={toolbarActions}
                                        onClear={selection.clearSelection}
                                        onAction={(action) => {
                                            void runAction(action);
                                        }}
                                    />
                                </div>
                            ) : (
                                <DataTableToolbar
                                    search={search}
                                    onSearchChange={setSearch}
                                    searchPlaceholder={
                                        isTrashed
                                            ? 'Search trash…'
                                            : 'Search files…'
                                    }
                                    trailing={
                                        <TagFilterPopover
                                            catalog={tagCatalog}
                                            selectedTagIds={selectedTagIds}
                                            onChange={visitWithTagFilter}
                                        />
                                    }
                                />
                            )
                        }
                        filtersRight={
                            selection.selectedIds.length > 0 ? null : (
                                <div className="flex items-center gap-1.5">
                                    <Select
                                        value={sort}
                                        onValueChange={(value) => {
                                            if (
                                                value === 'name' ||
                                                value === 'size' ||
                                                value === 'created_at' ||
                                                value === 'updated_at'
                                            ) {
                                                visitWithSort(value, direction);
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            size="sm"
                                            aria-label="Sort by"
                                            className="w-[7.5rem]"
                                        >
                                            <SelectValue placeholder="Sort" />
                                        </SelectTrigger>
                                        <SelectContent align="end">
                                            {FILE_SORT_FIELDS.map((field) => (
                                                <SelectItem
                                                    key={field.value}
                                                    value={field.value}
                                                >
                                                    {field.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-8"
                                        aria-label={
                                            direction === 'asc'
                                                ? 'Sort ascending'
                                                : 'Sort descending'
                                        }
                                        onClick={() => {
                                            visitWithSort(
                                                sort,
                                                direction === 'asc'
                                                    ? 'desc'
                                                    : 'asc',
                                            );
                                        }}
                                    >
                                        {direction === 'asc' ? (
                                            <ArrowUpAZ className="size-4" />
                                        ) : (
                                            <ArrowDownAZ className="size-4" />
                                        )}
                                    </Button>
                                    <ToggleGroup
                                        type="single"
                                        value={trashed}
                                        onValueChange={(value) => {
                                            if (
                                                value === 'active' ||
                                                value === 'trashed'
                                            ) {
                                                visitWithTrashed(value);
                                            }
                                        }}
                                    >
                                        <ToggleGroupItem
                                            value="active"
                                            aria-label="Active files"
                                            className="px-2.5"
                                        >
                                            <Files className="size-4" />
                                        </ToggleGroupItem>
                                        <ToggleGroupItem
                                            value="trashed"
                                            aria-label="Trash"
                                            className="px-2.5"
                                        >
                                            <Trash2 className="size-4" />
                                        </ToggleGroupItem>
                                    </ToggleGroup>
                                </div>
                            )
                        }
                    >
                        <FileGrid
                            files={files}
                            isTrashed={isTrashed}
                            uploadsEnabled={uploadsEnabled}
                            canEdit={canEdit}
                            selectedIds={selection.selectedIds}
                            multiSelectMode={selection.multiSelectMode}
                            dropTargetFolderId={dropTargetFolderId}
                            hasMore={page < lastPage}
                            loadingMore={loadingMore}
                            onLoadMore={() => {
                                void loadMore();
                            }}
                            onSelect={selection.handleSelectClick}
                            onOpenFolder={navigateToFolder}
                            onOpenDetails={openFileDetails}
                            onClearSelection={clearSelectionAndDetail}
                            onPrepareContextMenu={(file) => {
                                if (!selection.selectedIds.includes(file.id)) {
                                    selection.selectOnly(file.id);
                                }
                            }}
                            onAction={(action, file) => {
                                const targets = resolveContextMenuTargets(
                                    file,
                                    selection.selectedIds,
                                    selection.selectedFiles,
                                );
                                void runAction(action, targets);
                            }}
                            onDragStart={setDraggingFileId}
                            onDragEnd={() => {
                                setDraggingFileId(null);
                                setDropTargetFolderId(null);
                            }}
                            onDragOverFolder={setDropTargetFolderId}
                            onDragLeaveFolder={(folderId) => {
                                if (dropTargetFolderId === folderId) {
                                    setDropTargetFolderId(null);
                                }
                            }}
                            onDropOnFolder={(folderId) => {
                                if (
                                    canEdit &&
                                    draggingFileId !== null &&
                                    draggingFileId !== folderId
                                ) {
                                    void handleMoveToFolder(
                                        draggingFileId,
                                        folderId,
                                    );
                                }

                                setDraggingFileId(null);
                                setDropTargetFolderId(null);
                            }}
                            onDropOnGrid={() => {
                                if (canEdit && draggingFileId !== null) {
                                    void handleMoveToFolder(
                                        draggingFileId,
                                        parentId,
                                    );
                                }

                                setDraggingFileId(null);
                                setDropTargetFolderId(null);
                            }}
                            onNewFolder={() => setFolderDialogOpen(true)}
                            onUploadFile={() => fileInputRef.current?.click()}
                            onUploadFolder={() =>
                                folderInputRef.current?.click()
                            }
                            cardActionsFor={(file) =>
                                resolveFileActions(
                                    resolveContextMenuTargets(
                                        file,
                                        selection.selectedIds,
                                        selection.selectedFiles,
                                    ),
                                    actionPermissions,
                                    isTrashed,
                                )
                            }
                        />
                    </PageLayout>

                    {detailFile && !isTrashed && (
                        <FileDetailPanel
                            file={detailFile}
                            canUpdateMetadata={canUpdateMetadata}
                            canTag={canTag}
                            canReplace={canReplace}
                            tagCatalog={tagCatalog}
                            onClose={closeFileDetails}
                            onUpdated={(updated) => {
                                setDetailFile(updated);
                                setFiles((current) =>
                                    current.map((entry) =>
                                        entry.id === updated.id
                                            ? updated
                                            : entry,
                                    ),
                                );
                                void refreshTagCatalog();
                            }}
                        />
                    )}
                </div>
            </FileDropzone>

            <FileNameDialog
                open={folderDialogOpen}
                onOpenChange={setFolderDialogOpen}
                title="New folder"
                description="Create a folder in the current location."
                confirmLabel="Create folder"
                onConfirm={handleCreateFolder}
            />

            <FileNameDialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
                title="Rename"
                description="Enter a new name for this item."
                initialName={renameTargetFile?.name ?? ''}
                confirmLabel="Rename"
                onConfirm={handleRenameFile}
            />

            <Dialog
                open={tagDialogOpen}
                onOpenChange={(open) => {
                    setTagDialogOpen(open);

                    if (!open) {
                        resetBulkTagDialog();
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add tags</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Tags are shared across all files. Pick existing ones
                            or create a new name.
                        </p>
                        <TagPicker
                            value={bulkTags}
                            onChange={setBulkTags}
                            catalog={tagCatalog}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            onClick={() => {
                                void applyBulkTags();
                            }}
                        >
                            Apply tags
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FolderPickerDialog
                open={moveDialogOpen}
                onOpenChange={(open) => {
                    setMoveDialogOpen(open);

                    if (!open) {
                        setMoveTargetFiles([]);
                    }
                }}
                blockedFolders={blockedMoveFolders}
                onConfirm={handleConfirmMove}
            />

            <ConfirmDestructiveDialog
                open={pendingDestructive !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingDestructive(null);
                        setDestructiveRefCount(0);
                        setDestructiveRefLoading(false);
                    }
                }}
                title={
                    destructiveIsForce
                        ? destructiveCount === 1
                            ? 'Delete this file permanently?'
                            : `Delete ${destructiveCount} selected files permanently?`
                        : destructiveCount === 1
                          ? 'Delete this file?'
                          : `Delete ${destructiveCount} selected files?`
                }
                description={
                    <>
                        {destructiveIsForce
                            ? destructiveCount === 1
                                ? 'This file will be permanently removed. This cannot be undone.'
                                : 'Selected files will be permanently removed. This cannot be undone.'
                            : destructiveCount === 1
                              ? 'This file will be moved to trash.'
                              : 'Selected files will be moved to trash.'}
                        {destructiveRefLoading && (
                            <> Scanning item references…</>
                        )}
                        {!destructiveRefLoading && destructiveRefCount > 0 && (
                            <>
                                {' '}
                                Referenced by {destructiveRefCount} collection
                                item
                                {destructiveRefCount === 1 ? '' : 's'} — open
                                the detail panel for links. You can still delete
                                anyway.
                            </>
                        )}
                    </>
                }
                confirmLabel={
                    destructiveIsForce
                        ? destructiveRefCount > 0
                            ? 'Delete permanently anyway'
                            : 'Delete permanently'
                        : destructiveRefCount > 0
                          ? 'Delete anyway'
                          : 'Delete'
                }
                confirming={confirmingDestructive}
                onConfirm={() => {
                    void executePendingDestructive();
                }}
            />

            <FileUploadIndicator
                uploads={uploads}
                onDismiss={removeFileUpload}
                onDismissAll={dismissAllFileUploads}
            />
        </AppLayout>
    );
}
