import { Head, router } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronRight,
    FileIcon,
    Files,
    FolderOpen,
    FolderPlus,
    Home,
    Info,
    Pencil,
    Trash2,
    Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPageLayout } from '@/components/admin/admin-page-layout';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import {
    FileDropzone,
    INTERNAL_FILE_DRAG_TYPE,
    isInternalFileDrag,
} from '@/components/admin/file-dropzone';
import { FileFormDrawer } from '@/components/admin/file-form-drawer';
import { FileNameDialog } from '@/components/admin/file-name-dialog';
import { FileUploadIndicator } from '@/components/admin/file-upload-indicator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
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
    createFolder,
    deleteFile,
    filePublicUrl,
    isImageFile,
    moveFile,
    renameFile,
    uploadFileChunked,
    uploadFileDirect,
} from '@/lib/files-api';
import {
    collectFilesFromDataTransferItems,
    collectFilesFromFileList,
    ensureAllFolderPaths,
    ensureFolderPath,
    type FileWithDirectoryPath,
    hasDirectoryInDataTransferItems,
    runWithConcurrencyLimit,
} from '@/lib/folder-upload';
import { cn } from '@/lib/utils';
import type { AdminFileRow, FileBreadcrumb, FileUploadProgress } from '@/types/files';
import type { BreadcrumbItem } from '@/types';

type FileFilters = {
    trashed?: 'only' | 'with' | null;
};

export default function AdminFilesIndex({
    files: initialFiles,
    parentId = null,
    breadcrumbs: initialBreadcrumbs = [],
    filters = {},
}: {
    files: AdminFileRow[];
    parentId?: number | null;
    breadcrumbs?: FileBreadcrumb[];
    filters?: FileFilters;
}) {
    const { can } = useCan();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState(initialFiles);
    const [search, setSearch] = useState('');
    const [selectedFile, setSelectedFile] = useState<AdminFileRow | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renameTargetFile, setRenameTargetFile] =
        useState<AdminFileRow | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [uploads, setUploads] = useState<FileUploadProgress[]>([]);
    const [draggingFileId, setDraggingFileId] = useState<number | null>(null);
    const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(
        null,
    );
    const [trashed, setTrashed] = useState<'active' | 'trashed'>(
        filters.trashed === 'only' ? 'trashed' : 'active',
    );

    const canCreate = can(PermissionEnum.CanCreateFiles);
    const canEdit = can(PermissionEnum.CanEditFiles);
    const canDelete = can(PermissionEnum.CanDeleteFiles);
    const canRestore = can(PermissionEnum.CanRestoreFiles);
    const canForceDelete = can(PermissionEnum.CanForceDeleteFiles);
    const isTrashed = trashed === 'trashed';
    const uploadsEnabled = canCreate && !isTrashed;

    useEffect(() => {
        setFiles(initialFiles);
    }, [initialFiles]);

    useEffect(() => {
        return subscribeToFileUploads(setUploads);
    }, []);

    const pageBreadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Admin', href: adminRoutes.files.index() },
            { title: 'Files', href: adminRoutes.files.index() },
        ],
        [],
    );

    const buildIndexQuery = useCallback(
        (folderId: number | null = parentId): Record<string, string | number> => {
            const query: Record<string, string | number> = {};

            if (folderId !== null) {
                query.parent_id = folderId;
            }

            if (isTrashed) {
                query.trashed = 'only';
            }

            return query;
        },
        [isTrashed, parentId],
    );

    const refreshPage = useCallback(() => {
        router.get(
            adminRoutes.files.index({
                query: buildIndexQuery(),
            }),
            {},
            {
                preserveState: true,
                preserveScroll: true,
                onSuccess: (page) => {
                    const props = page.props as {
                        files?: AdminFileRow[];
                    };

                    if (props.files) {
                        setFiles(props.files);
                    }
                },
            },
        );
    }, [buildIndexQuery]);

    const navigateToFolder = (folderId: number | null): void => {
        if (isTrashed) {
            return;
        }

        router.get(
            adminRoutes.files.index({
                query: folderId ? { parent_id: folderId } : undefined,
            }),
        );
    };

    const visitWithTrashed = (nextTrashed: 'active' | 'trashed'): void => {
        setTrashed(nextTrashed);

        router.get(
            adminRoutes.files.index({
                query:
                    nextTrashed === 'trashed'
                        ? { trashed: 'only' }
                        : parentId
                          ? { parent_id: parentId }
                          : undefined,
            }),
            {},
            { preserveState: true, preserveScroll: true },
        );
    };

    const filteredFiles = useMemo(() => {
        const term = search.trim().toLowerCase();

        if (!term) {
            return files;
        }

        return files.filter((file) => file.name.toLowerCase().includes(term));
    }, [files, search]);

    const enqueueUpload = useCallback(
        async (
            file: File,
            targetParentId: number | null = parentId,
        ): Promise<boolean> => {
            const uploadId = createUploadId();
            const totalChunks = Math.max(
                1,
                Math.ceil(file.size / CHUNK_SIZE_BYTES),
            );

            addFileUpload({
                uploadId,
                fileName: file.name,
                totalChunks,
                uploadedChunks: 0,
                status: 'uploading',
            });

            try {
                if (file.size > CHUNK_SIZE_BYTES) {
                    await uploadFileChunked(
                        file,
                        targetParentId,
                        (uploaded, total) => {
                            updateFileUpload(uploadId, (entry) => ({
                                ...entry,
                                uploadedChunks: uploaded,
                                totalChunks: total,
                                status: 'uploading',
                            }));
                        },
                    );
                } else {
                    await uploadFileDirect(file, targetParentId);
                    updateFileUpload(uploadId, (entry) => ({
                        ...entry,
                        uploadedChunks: 1,
                        totalChunks: 1,
                        status: 'uploading',
                    }));
                }

                updateFileUpload(uploadId, (entry) => ({
                    ...entry,
                    status: 'complete',
                    uploadedChunks: entry.totalChunks,
                }));

                return true;
            } catch (error) {
                updateFileUpload(uploadId, (entry) => ({
                    ...entry,
                    status: 'error',
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Upload failed',
                }));

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

            setPageError(null);

            const directoryPaths = filesToUpload.map(
                (entry) => entry.directoryPath,
            );
            const folderIdByPath = await ensureAllFolderPaths(
                directoryPaths,
                parentId,
            );

            let uploadedCount = 0;

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
                    );

                    if (uploaded) {
                        uploadedCount += 1;
                    }
                }),
            );

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
                    setPageError(
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
        setPageError(null);
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
            setPageError(null);
            await moveFile(fileId, targetFolderId);
            refreshPage();
        } catch (error) {
            setPageError(
                error instanceof Error ? error.message : 'Failed to move file',
            );
        }
    };

    const openFileDetails = (file: AdminFileRow): void => {
        setSelectedFile(file);
        setDrawerOpen(true);
    };

    const openRenameDialog = (file: AdminFileRow): void => {
        setRenameTargetFile(file);
        setRenameDialogOpen(true);
    };

    const handleRenameFile = async (name: string): Promise<void> => {
        if (!renameTargetFile) {
            return;
        }

        setPageError(null);
        await renameFile(renameTargetFile.id, name);
        refreshPage();
    };

    const handleDeleteFile = async (file: AdminFileRow): Promise<void> => {
        if (!canDelete || isTrashed) {
            return;
        }

        try {
            setPageError(null);
            await deleteFile(file.id);
            refreshPage();
        } catch (error) {
            setPageError(
                error instanceof Error ? error.message : 'Failed to delete file',
            );
        }
    };

    return (
        <AppLayout breadcrumbs={pageBreadcrumbs}>
            <Head title="Files" />

            <FileDropzone
                disabled={!uploadsEnabled}
                onFilesSelected={handleFilesSelected}
                onItemsDropped={handleItemsDropped}
                className="min-h-0 flex-1"
            >
                <AdminPageLayout
                    className="min-h-0 flex-1"
                    title="File manager"
                    icon={FolderOpen}
                    headerExtra={
                        !isTrashed ? (
                            <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
                                <button
                                    type="button"
                                    className="hover:text-foreground inline-flex items-center gap-1"
                                    onClick={() => navigateToFolder(null)}
                                >
                                    <Home className="size-3.5" />
                                    Root
                                </button>
                                {initialBreadcrumbs.map((crumb) => (
                                    <span
                                        key={crumb.id}
                                        className="inline-flex items-center gap-1"
                                    >
                                        <ChevronRight className="size-3.5" />
                                        <button
                                            type="button"
                                            className="hover:text-foreground"
                                            onClick={() =>
                                                navigateToFolder(crumb.id)
                                            }
                                        >
                                            {crumb.name}
                                        </button>
                                    </span>
                                ))}
                            </nav>
                        ) : undefined
                    }
                    actions={
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
                    filtersLeft={
                        <DataTableToolbar
                            search={search}
                            onSearchChange={setSearch}
                            searchPlaceholder={
                                isTrashed
                                    ? 'Filter trash…'
                                    : 'Filter current folder…'
                            }
                        />
                    }
                    filtersRight={
                        <ToggleGroup
                            type="single"
                            value={trashed}
                            onValueChange={(value) => {
                                if (value === 'active' || value === 'trashed') {
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
                    }
                >
                    {pageError ? (
                        <Alert variant="destructive">
                            <AlertTitle>File manager error</AlertTitle>
                            <AlertDescription>{pageError}</AlertDescription>
                        </Alert>
                    ) : null}

                    <div className="flex min-h-0 flex-1 flex-col">
                        {filteredFiles.length === 0 && (
                            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-sidebar-border/70 bg-muted/20 p-8 text-center">
                                <Upload className="size-8 opacity-60" />
                                <p className="text-sm font-medium">
                                    {isTrashed
                                        ? 'Trash is empty'
                                        : uploadsEnabled
                                          ? 'Drop files anywhere to upload'
                                          : 'This folder is empty'}
                                </p>
                                {uploadsEnabled && !isTrashed && (
                                    <p className="text-xs">
                                        Or use the Upload button above
                                    </p>
                                )}
                            </div>
                        )}

                        {filteredFiles.length > 0 && (
                            <div
                                className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
                                onDragOver={(event) => {
                                    if (
                                        isTrashed ||
                                        !isInternalFileDrag(event)
                                    ) {
                                        return;
                                    }

                                    event.preventDefault();
                                }}
                                onDrop={(event) => {
                                    if (
                                        isTrashed ||
                                        !isInternalFileDrag(event)
                                    ) {
                                        return;
                                    }

                                    event.preventDefault();

                                    if (canEdit && draggingFileId !== null) {
                                        void handleMoveToFolder(
                                            draggingFileId,
                                            parentId,
                                        );
                                    }

                                    setDraggingFileId(null);
                                    setDropTargetFolderId(null);
                                }}
                            >
                        {filteredFiles.map((file) => {
                            const isFolder = file.type === 'folder';
                            const publicUrl = filePublicUrl(file);
                            const isDropTarget =
                                isFolder &&
                                dropTargetFolderId === file.id &&
                                !isTrashed;

                            return (
                                <ContextMenu key={file.id} modal={false}>
                                    <ContextMenuTrigger asChild>
                                        <div
                                            draggable={
                                                canEdit &&
                                                !isFolder &&
                                                !isTrashed
                                            }
                                            className={cn(
                                                'group relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors',
                                                'border-sidebar-border/70 bg-card hover:bg-muted/40',
                                                isDropTarget &&
                                                    'ring-primary ring-2',
                                                isTrashed && 'opacity-80',
                                            )}
                                            onDragStart={(event) => {
                                                if (isTrashed) {
                                                    return;
                                                }

                                                setDraggingFileId(file.id);
                                                event.dataTransfer.setData(
                                                    INTERNAL_FILE_DRAG_TYPE,
                                                    String(file.id),
                                                );
                                            }}
                                            onDragEnd={() => {
                                                setDraggingFileId(null);
                                                setDropTargetFolderId(null);
                                            }}
                                            onDragOver={(event) => {
                                                if (
                                                    !isFolder ||
                                                    !canEdit ||
                                                    isTrashed ||
                                                    !isInternalFileDrag(event)
                                                ) {
                                                    return;
                                                }

                                                event.preventDefault();
                                                setDropTargetFolderId(file.id);
                                            }}
                                            onDragLeave={() => {
                                                if (
                                                    dropTargetFolderId ===
                                                    file.id
                                                ) {
                                                    setDropTargetFolderId(null);
                                                }
                                            }}
                                            onDrop={(event) => {
                                                if (
                                                    isTrashed ||
                                                    !isInternalFileDrag(event)
                                                ) {
                                                    return;
                                                }

                                                event.preventDefault();
                                                event.stopPropagation();

                                                if (
                                                    canEdit &&
                                                    draggingFileId !== null &&
                                                    isFolder &&
                                                    draggingFileId !== file.id
                                                ) {
                                                    void handleMoveToFolder(
                                                        draggingFileId,
                                                        file.id,
                                                    );
                                                }

                                                setDraggingFileId(null);
                                                setDropTargetFolderId(null);
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className="flex w-full flex-col items-center gap-2"
                                                onClick={() => {
                                                    if (
                                                        isFolder &&
                                                        !isTrashed
                                                    ) {
                                                        navigateToFolder(
                                                            file.id,
                                                        );
                                                        return;
                                                    }

                                                    openFileDetails(file);
                                                }}
                                            >
                                                {isFolder ? (
                                                    <FolderOpen className="size-12 text-amber-500" />
                                                ) : publicUrl &&
                                                  isImageFile(file) ? (
                                                    <img
                                                        src={publicUrl}
                                                        alt={file.name}
                                                        className="size-12 rounded object-cover"
                                                    />
                                                ) : (
                                                    <FileIcon className="text-muted-foreground size-12" />
                                                )}
                                                <span className="w-full truncate text-center text-xs font-medium">
                                                    {file.name}
                                                </span>
                                            </button>
                                        </div>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                        <ContextMenuItem
                                            onSelect={() =>
                                                openFileDetails(file)
                                            }
                                        >
                                            <Info className="size-4" />
                                            Open for details
                                        </ContextMenuItem>
                                        {canEdit && !isTrashed && (
                                            <ContextMenuItem
                                                onSelect={() =>
                                                    openRenameDialog(file)
                                                }
                                            >
                                                <Pencil className="size-4" />
                                                Rename
                                            </ContextMenuItem>
                                        )}
                                        {canDelete && !isTrashed && (
                                            <>
                                                <ContextMenuSeparator />
                                                <ContextMenuItem
                                                    variant="destructive"
                                                    onSelect={() => {
                                                        void handleDeleteFile(
                                                            file,
                                                        );
                                                    }}
                                                >
                                                    <Trash2 className="size-4" />
                                                    Delete
                                                </ContextMenuItem>
                                            </>
                                        )}
                                    </ContextMenuContent>
                                </ContextMenu>
                            );
                        })}
                            </div>
                        )}
                    </div>
                </AdminPageLayout>
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

            <FileFormDrawer
                file={selectedFile}
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                onUpdated={refreshPage}
                canEdit={canEdit && !isTrashed}
                canDelete={canDelete && !isTrashed}
                canRestore={canRestore && isTrashed}
                canForceDelete={canForceDelete && isTrashed}
                isTrashed={isTrashed}
            />

            <FileUploadIndicator
                uploads={uploads}
                onDismiss={removeFileUpload}
                onDismissAll={dismissAllFileUploads}
            />
        </AppLayout>
    );
}
