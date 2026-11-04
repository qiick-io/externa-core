import { FolderOpen, FolderPlus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isInternalFileDrag } from '@/components/admin/file-dropzone';
import { FileCard } from '@/components/admin/files/file-card';
import { PageEmptyState } from '@/components/admin/page-empty-state';
import { EmptyStatus } from '@/components/empty-status';
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
    const { t } = useTranslation();

    if (!enabled) {
        return children;
    }

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent data-testid="files-empty-area-context-menu">
                <ContextMenuItem onSelect={onNewFolder}>
                    <FolderPlus className="size-4" />
                    {t('files.empty.contextNewFolder')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={onUploadFile}>
                    <Upload className="size-4" />
                    {t('files.empty.contextUploadFile')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={onUploadFolder}>
                    <FolderOpen className="size-4" />
                    {t('files.empty.contextUploadFolder')}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

/**
 * Grid of file cards with selection and drag-and-drop.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
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
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
    // List state at the last automatic load; a failed or empty load leaves it
    // unchanged, so auto-loading stops (the button still retries) instead of looping.
    const lastAutoLoadKeyRef = useRef<string | null>(null);
    const listKey = `${files.length}:${files[0]?.id ?? ''}`;
    // Parents pass an inline callback; read the latest one without re-observing.
    const onLoadMoreRef = useRef(onLoadMore);

    useEffect(() => {
        onLoadMoreRef.current = onLoadMore;
    }, [onLoadMore]);

    // Load the next page whenever the sentinel under the grid is on screen, so a
    // tall window fills up without a gap and scrolling keeps loading (Drive-style).
    useEffect(() => {
        const sentinel = loadMoreSentinelRef.current;

        if (!sentinel || !hasMore || loadingMore) {
            return;
        }

        // Observe against the panel that scrolls (not the window), so the 400px
        // look-ahead starts loading before the user reaches the end.
        let scrollRoot: HTMLElement | null = sentinel.parentElement;

        while (
            scrollRoot &&
            !/(auto|scroll)/.test(getComputedStyle(scrollRoot).overflowY)
        ) {
            scrollRoot = scrollRoot.parentElement;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries.some((entry) => entry.isIntersecting) &&
                    lastAutoLoadKeyRef.current !== listKey
                ) {
                    lastAutoLoadKeyRef.current = listKey;
                    onLoadMoreRef.current();
                }
            },
            { root: scrollRoot, rootMargin: '0px 0px 400px 0px' },
        );

        observer.observe(sentinel);

        return () => observer.disconnect();
    }, [hasMore, listKey, loadingMore]);

    const { t } = useTranslation();

    const handleBackgroundPointerDown = (
        event: PointerEvent<HTMLDivElement>,
    ): void => {
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
                    className="flex flex-1 flex-col"
                    onPointerDown={handleBackgroundPointerDown}
                >
                    <PageEmptyState
                        icon={isTrashed ? Trash2 : Upload}
                        title={
                            <EmptyStatus>
                                {isTrashed
                                    ? t('emptyState.files.trashTitle')
                                    : uploadsEnabled
                                      ? t('emptyState.files.dropTitle')
                                      : t('emptyState.files.title')}
                            </EmptyStatus>
                        }
                        description={
                            isTrashed
                                ? t('emptyState.files.trashDescription')
                                : uploadsEnabled
                                  ? t('emptyState.files.dropDescription')
                                  : t('emptyState.files.description')
                        }
                        action={
                            uploadsEnabled && !isTrashed ? (
                                <Button type="button" onClick={onUploadFile}>
                                    <Upload className="size-4" />
                                    {t('emptyState.files.cta')}
                                </Button>
                            ) : undefined
                        }
                        className="min-h-64 flex-1 bg-muted/20"
                    />
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
                className="flex flex-1 flex-col gap-3"
                onPointerDown={handleBackgroundPointerDown}
            >
                <div
                    className="grid flex-1 grid-cols-2 content-start items-start gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
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
                    <div
                        ref={loadMoreSentinelRef}
                        data-testid="files-load-more"
                        className="flex justify-center py-2"
                    >
                        <Button
                            type="button"
                            variant="outline"
                            disabled={loadingMore}
                            onClick={onLoadMore}
                        >
                            {loadingMore
                                ? t('files.loading')
                                : t('files.loadMore')}
                        </Button>
                    </div>
                )}
            </div>
        </EmptyAreaContextMenu>
    );
}
