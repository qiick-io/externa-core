import { FolderOpen, FolderPlus, Upload } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { FileCard } from '@/components/admin/files/file-card';
import {
    isInternalFileDrag,
} from '@/components/admin/file-dropzone';
import { Button } from '@/components/ui/button';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type {
    AdminFileRow,
    FileActionDefinition,
    FileActionKey,
} from '@/types/files';

type FileGridProps = {
    files: AdminFileRow[];
    isTrashed: boolean;
    uploadsEnabled: boolean;
    canEdit: boolean;
    selectedIds: number[];
    multiSelectMode: boolean;
    dropTargetFolderId: number | null;
    hasMore: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    onSelect: (
        fileId: number,
        event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
    ) => void;
    onOpenFolder: (folderId: number) => void;
    onOpenDetails: (file: AdminFileRow) => void;
    onClearSelection: () => void;
    onAction: (action: FileActionKey, file: AdminFileRow) => void;
    onPrepareContextMenu: (file: AdminFileRow) => void;
    onDragStart: (fileId: number) => void;
    onDragEnd: () => void;
    onDragOverFolder: (folderId: number) => void;
    onDragLeaveFolder: (folderId: number) => void;
    onDropOnFolder: (folderId: number) => void;
    onDropOnGrid: () => void;
    onNewFolder: () => void;
    onUploadFile: () => void;
    onUploadFolder: () => void;
    cardActionsFor: (file: AdminFileRow) => FileActionDefinition[];
};

function isInteractiveGridClickTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
        return false;
    }

    // Cards, load-more, and other controls must not clear selection.
    return (
        target.closest('[data-testid^="file-card-"]') !== null ||
        target.closest('button') !== null ||
        target.closest('[role="checkbox"]') !== null ||
        target.closest('[role="menuitem"]') !== null
    );
}

function EmptyAreaContextMenu({
    enabled,
    onNewFolder,
    onUploadFile,
    onUploadFolder,
    children,
}: {
    enabled: boolean;
    onNewFolder: () => void;
    onUploadFile: () => void;
    onUploadFolder: () => void;
    children: ReactNode;
}) {
    if (!enabled) {
        return children;
    }

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent data-testid="files-empty-area-context-menu">
                <ContextMenuItem onSelect={onNewFolder}>
                    <FolderPlus className="size-4" />
                    New Folder
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={onUploadFile}>
                    <Upload className="size-4" />
                    Upload File
                </ContextMenuItem>
                <ContextMenuItem onSelect={onUploadFolder}>
                    <FolderOpen className="size-4" />
                    Upload Folder
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

export function FileGrid({
    files,
    isTrashed,
    uploadsEnabled,
    canEdit,
    selectedIds,
    multiSelectMode,
    dropTargetFolderId,
    hasMore,
    loadingMore,
    onLoadMore,
    onSelect,
    onOpenFolder,
    onOpenDetails,
    onClearSelection,
    onAction,
    onPrepareContextMenu,
    onDragStart,
    onDragEnd,
    onDragOverFolder,
    onDragLeaveFolder,
    onDropOnFolder,
    onDropOnGrid,
    onNewFolder,
    onUploadFile,
    onUploadFolder,
    cardActionsFor,
}: FileGridProps) {
    const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>): void => {
        if (isInteractiveGridClickTarget(event.target)) {
            return;
        }

        onClearSelection();
    };

    if (files.length === 0) {
        return (
            <EmptyAreaContextMenu
                enabled={uploadsEnabled}
                onNewFolder={onNewFolder}
                onUploadFile={onUploadFile}
                onUploadFolder={onUploadFolder}
            >
                <div
                    data-testid="files-grid-area"
                    className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-sidebar-border/70 bg-muted/20 p-8 text-center"
                    onClick={handleBackgroundClick}
                >
                    <Upload className="size-8 opacity-60" />
                    <p className="text-sm font-medium">
                        {isTrashed
                            ? 'Trash is empty'
                            : uploadsEnabled
                              ? 'Drop files anywhere to upload'
                              : 'This folder is empty'}
                    </p>
                    {uploadsEnabled && !isTrashed && (
                        <p className="text-xs">Or use the Upload button above</p>
                    )}
                </div>
            </EmptyAreaContextMenu>
        );
    }

    return (
        <EmptyAreaContextMenu
            enabled={uploadsEnabled}
            onNewFolder={onNewFolder}
            onUploadFile={onUploadFile}
            onUploadFolder={onUploadFolder}
        >
            <div
                data-testid="files-grid-area"
                className="flex min-h-0 flex-1 flex-col gap-3"
                onClick={handleBackgroundClick}
            >
                <div
                    className="grid min-h-0 flex-1 grid-cols-2 content-start items-start gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
                    onDragOver={(event) => {
                        if (isTrashed || !isInternalFileDrag(event)) {
                            return;
                        }

                        event.preventDefault();
                    }}
                    onDrop={(event) => {
                        if (isTrashed || !isInternalFileDrag(event)) {
                            return;
                        }

                        event.preventDefault();
                        onDropOnGrid();
                    }}
                >
                    {files.map((file) => (
                        <FileCard
                            key={file.id}
                            file={file}
                            selected={selectedIds.includes(file.id)}
                            multiSelectMode={multiSelectMode}
                            isDropTarget={
                                file.type === 'folder' &&
                                dropTargetFolderId === file.id &&
                                !isTrashed
                            }
                            isTrashed={isTrashed}
                            canEdit={canEdit}
                            canDrag={canEdit}
                            actions={cardActionsFor(file)}
                            onSelect={onSelect}
                            onOpenFolder={onOpenFolder}
                            onOpenDetails={onOpenDetails}
                            onAction={onAction}
                            onPrepareContextMenu={onPrepareContextMenu}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onDragOverFolder={onDragOverFolder}
                            onDragLeaveFolder={onDragLeaveFolder}
                            onDropOnFolder={onDropOnFolder}
                        />
                    ))}
                </div>

                {hasMore && (
                    <div className="flex justify-center py-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={loadingMore}
                            onClick={onLoadMore}
                        >
                            {loadingMore ? 'Loading…' : 'Load more'}
                        </Button>
                    </div>
                )}
            </div>
        </EmptyAreaContextMenu>
    );
}
