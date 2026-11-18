import { Head, router } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableToolbar } from '@/components/admin/data-table-toolbar';
import { FileDropzone } from '@/components/admin/file-dropzone';
import { FileNameDialog } from '@/components/admin/file-name-dialog';
import { FileUploadIndicator } from '@/components/admin/file-upload-indicator';
import {
    resolveContextMenuTargets,
    resolveFileActions,
} from '@/components/admin/files/file-actions';
import { FileDetailPanel } from '@/components/admin/files/file-detail-panel';
import { FileGrid } from '@/components/admin/files/file-grid';
import { FilesBulkTagDialog } from '@/components/admin/files/files-bulk-tag-dialog';
import { FilesDestructiveDialog } from '@/components/admin/files/files-destructive-dialog';
import { FilesHeaderActions } from '@/components/admin/files/files-header-actions';
import { FilesSelectionToolbar } from '@/components/admin/files/files-selection-toolbar';
import { FilesSortControls } from '@/components/admin/files/files-sort-controls';
import { FolderPickerDialog } from '@/components/admin/files/folder-picker-dialog';
import { TagFilterPopover } from '@/components/admin/files/tag-filter-popover';
import { useFileDetails } from '@/components/admin/files/use-file-details';
import { useFileTagCatalog } from '@/components/admin/files/use-file-tag-catalog';
import { useFilesActionRunner } from '@/components/admin/files/use-files-action-runner';
import { useFilesBackgroundJobs } from '@/components/admin/files/use-files-background-jobs';
import { useFilesDestructiveAction } from '@/components/admin/files/use-files-destructive-action';
import { useFilesDragMove } from '@/components/admin/files/use-files-drag-move';
import { useFilesFilters } from '@/components/admin/files/use-files-filters';
import type {
    FileFilters,
    FileSortDirection,
    FileSortField,
    FilesTrashedView,
} from '@/components/admin/files/use-files-filters';
import { useFilesListing } from '@/components/admin/files/use-files-listing';
import { useFilesPermissions } from '@/components/admin/files/use-files-permissions';
import { useFilesSelection } from '@/components/admin/files/use-files-selection';
import { useFilesUpload } from '@/components/admin/files/use-files-upload';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { PageLayout } from '@/components/layout/page-layout';
import { useRegisterActiveUploads } from '@/hooks/use-register-active-uploads';
import AppLayout from '@/layouts/app-layout';
import {
    dismissAllFileUploads,
    removeFileUpload,
} from '@/lib/file-upload-store';
import {
    bulkFileAction,
    createFolder,
    queueEmptyFilesTrash,
    renameFile,
} from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type {
    AdminFileRow,
    FileBreadcrumb,
    FilesPaginator,
} from '@/types/files';

/**
 * Admin file manager with grid, uploads, and bulk actions.
 *
 * The page wires the file manager hooks together (filters, listing, uploads,
 * background jobs, selection, details, drag-and-drop, actions) and owns the
 * state of its dialogs.
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
    const { t } = useTranslation();
    useRegisterActiveUploads();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const {
        canCreate,
        canEdit,
        canForceDelete,
        canReplace,
        canTag,
        canUpdateMetadata,
        isAiAvailable,
        actionPermissions,
    } = useFilesPermissions();
    const {
        trashed,
        setTrashed,
        isTrashed,
        selectedTagIds,
        setSelectedTagIds,
        sort,
        setSort,
        direction,
        setDirection,
        pageBreadcrumbs,
        buildFilesIndexUrl,
    } = useFilesFilters(filters, parentId, initialBreadcrumbs);
    const {
        files,
        setFiles,
        search,
        setSearch,
        hasMore,
        isLoadingMore,
        loadMore,
        refreshPage,
        beginListFilterVisit,
    } = useFilesListing({
        initialFiles,
        parentId,
        isTrashed,
        selectedTagIds,
        sort,
        direction,
    });
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renameTargetFile, setRenameTargetFile] =
        useState<AdminFileRow | null>(null);
    const [tagDialogOpen, setTagDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [moveTargetFiles, setMoveTargetFiles] = useState<AdminFileRow[]>([]);
    const [emptyTrashDialogOpen, setEmptyTrashDialogOpen] = useState(false);
    const [queueingEmptyTrash, setQueueingEmptyTrash] = useState(false);
    const { tagCatalog, refreshTagCatalog } = useFileTagCatalog();
    const {
        pendingTrashJobCount,
        trackPendingDuplication,
        trackPendingZip,
        trackPendingTrash,
    } = useFilesBackgroundJobs(refreshPage);
    const uploadsEnabled = canCreate && !isTrashed;
    const {
        uploads,
        handleFilesSelected,
        handleItemsDropped,
        handleUploadInputChange,
    } = useFilesUpload({ parentId, uploadsEnabled, refreshPage });

    const selectionResetKey = `${parentId ?? 'root'}:${trashed}:${selectedTagIds.join(',')}`;
    const selection = useFilesSelection(files, selectionResetKey);
    const clearSelection = selection.clearSelection;
    const { detailFile, setDetailFile, openFileDetails, closeFileDetails } =
        useFileDetails(files, isTrashed, selection.selectOnly);
    const dragMove = useFilesDragMove({
        canEdit,
        isTrashed,
        parentId,
        refreshPage,
    });
    const destructive = useFilesDestructiveAction(() => {
        selection.clearSelection();
        setDetailFile(null);
        refreshPage();
    });

    const clearSelectionAndDetail = useCallback((): void => {
        clearSelection();
        setDetailFile(null);
    }, [clearSelection, setDetailFile]);

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

    const navigateToFolder = (folderId: number | null): void => {
        if (isTrashed) {
            return;
        }

        router.get(buildFilesIndexUrl({ folderId }));
    };

    const visitWithTrashed = (nextTrashed: FilesTrashedView): void => {
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
                t,
            ),
        [selection.selectedFiles, actionPermissions, isTrashed, t],
    );

    const handleCreateFolder = async (name: string): Promise<void> => {
        await createFolder(name, parentId);
        refreshPage();
    };

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

    const runAction = useFilesActionRunner({
        selectedFiles: selection.selectedFiles,
        clearSelection: selection.clearSelection,
        parentId,
        isAiAvailable,
        refreshPage,
        trackPendingDuplication,
        trackPendingZip,
        openFileDetails,
        requestDestructive: destructive.requestDestructive,
        openMoveDialog: (targets) => {
            setMoveTargetFiles(targets);
            setMoveDialogOpen(true);
        },
        openRenameDialog,
        openTagDialog: () => setTagDialogOpen(true),
    });

    const emptyTrash = async (): Promise<void> => {
        setQueueingEmptyTrash(true);

        try {
            const jobId = await queueEmptyFilesTrash();

            trackPendingTrash(jobId);
            setEmptyTrashDialogOpen(false);
            toast.info(t('files.toasts.trashEmptying'));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.toasts.trashEmptyFailed'),
            );
        } finally {
            setQueueingEmptyTrash(false);
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
                <FilesHeaderActions
                    isTrashed={isTrashed}
                    canForceDelete={canForceDelete}
                    canCreate={canCreate}
                    uploadsEnabled={uploadsEnabled}
                    isEmptyTrashDisabled={
                        files.length === 0 || pendingTrashJobCount > 0
                    }
                    fileInputRef={fileInputRef}
                    folderInputRef={folderInputRef}
                    onEmptyTrash={() => setEmptyTrashDialogOpen(true)}
                    onNewFolder={() => setFolderDialogOpen(true)}
                    onUploadInputChange={handleUploadInputChange}
                />
            }
        >
            <Head title={t('files.title')} />

            <FileDropzone
                disabled={!uploadsEnabled}
                onFilesSelected={handleFilesSelected}
                onItemsDropped={handleItemsDropped}
                className="min-h-0 flex-1"
            >
                <div className="flex min-h-0 flex-1">
                    {/* scrollContent: the grid scrolls inside the panel (it was clipped with no scroll on short windows). */}
                    <PageLayout
                        className="min-h-0 min-w-0 flex-1"
                        scrollContent
                        filters={
                            selection.selectedIds.length > 0 ? (
                                <div className="flex w-full min-w-0 items-center gap-2">
                                    <FilesSelectionToolbar
                                        count={selection.selectedIds.length}
                                        visibleCount={files.length}
                                        actions={toolbarActions}
                                        onSelectAll={selection.selectAll}
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
                                            ? t('files.toolbar.searchTrash')
                                            : t('files.toolbar.searchFiles')
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
                                <FilesSortControls
                                    sort={sort}
                                    direction={direction}
                                    trashed={trashed}
                                    onSortChange={visitWithSort}
                                    onTrashedChange={visitWithTrashed}
                                />
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
                            hasMore={hasMore}
                            loadingMore={isLoadingMore}
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
                            {...dragMove}
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
                                    t,
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
                title={t('files.dialogs.newFolderTitle')}
                description={t('files.dialogs.newFolderDescription')}
                confirmLabel={t('files.dialogs.createFolder')}
                onConfirm={handleCreateFolder}
            />

            <FileNameDialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
                title={t('files.dialogs.renameTitle')}
                description={t('files.dialogs.renameDescription')}
                initialName={renameTargetFile?.name ?? ''}
                confirmLabel={t('files.actions.rename')}
                onConfirm={handleRenameFile}
            />

            <FilesBulkTagDialog
                open={tagDialogOpen}
                onOpenChange={setTagDialogOpen}
                tagCatalog={tagCatalog}
                selectedIds={selection.selectedIds}
                onApplied={async () => {
                    await refreshTagCatalog();
                    refreshPage();
                }}
            />

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
                open={emptyTrashDialogOpen}
                onOpenChange={setEmptyTrashDialogOpen}
                title={t('files.toolbar.emptyTrashTitle')}
                description={t('files.toolbar.emptyTrashDescription')}
                confirmLabel={t('files.toolbar.emptyTrash')}
                confirming={queueingEmptyTrash}
                onConfirm={() => {
                    void emptyTrash();
                }}
            />

            <FilesDestructiveDialog destructive={destructive} />

            <FileUploadIndicator
                uploads={uploads}
                onDismiss={removeFileUpload}
                onDismissAll={dismissAllFileUploads}
            />
        </AppLayout>
    );
}
