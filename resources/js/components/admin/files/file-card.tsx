import { Star } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    INTERNAL_FILE_DRAG_TYPE,
    isInternalFileDrag,
} from '@/components/admin/file-dropzone';
import {
    FilePreview,
    hasCoverMedia,
} from '@/components/admin/files/file-preview';
import { cn } from '@/lib/utils';
import type {
    AdminFileRow,
    FileActionDefinition,
    FileActionKey,
} from '@/types/files';

type FileCardProps = {
    file: AdminFileRow;
    selected: boolean;
    multiSelectMode: boolean;
    isDropTarget: boolean;
    isTrashed: boolean;
    canEdit: boolean;
    canDrag: boolean;
    actions: FileActionDefinition[];
    onSelect: (
        fileId: number,
        event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
    ) => void;
    onOpenFolder: (folderId: number) => void;
    onOpenDetails: (file: AdminFileRow) => void;
    onAction: (action: FileActionKey, file: AdminFileRow) => void;
    onPrepareContextMenu: (file: AdminFileRow) => void;
    onDragStart: (fileId: number) => void;
    onDragEnd: () => void;
    onDragOverFolder: (folderId: number) => void;
    onDragLeaveFolder: (folderId: number) => void;
    onDropOnFolder: (folderId: number) => void;
};

export function FileCard({
    file,
    selected,
    multiSelectMode,
    isDropTarget,
    isTrashed,
    canEdit,
    canDrag,
    actions,
    onSelect,
    onOpenFolder,
    onOpenDetails,
    onAction,
    onPrepareContextMenu,
    onDragStart,
    onDragEnd,
    onDragOverFolder,
    onDragLeaveFolder,
    onDropOnFolder,
}: FileCardProps) {
    const [hovered, setHovered] = useState(false);
    const isFolder = file.type === 'folder';
    const useCoverLayout = hasCoverMedia(file);
    const showCheckbox = hovered || selected || multiSelectMode;
    const firstDestructiveIndex = actions.findIndex(
        (action) => action.destructive,
    );
    const displayName = file.title || file.name;

    const titleControl = isFolder && !isTrashed ? (
        <button
            type="button"
            className={cn(
                'w-full min-w-0 truncate text-center text-xs leading-4 font-medium hover:underline',
                !useCoverLayout && 'h-4',
            )}
            onClick={(event) => {
                event.stopPropagation();
                onOpenFolder(file.id);
            }}
        >
            {displayName}
        </button>
    ) : (
        <button
            type="button"
            className={cn(
                'w-full min-w-0 truncate text-center text-xs leading-4 font-medium',
                !useCoverLayout && 'h-4',
            )}
            onClick={(event) => {
                event.stopPropagation();
                onSelect(file.id, event);
            }}
        >
            {displayName}
        </button>
    );

    const tagsRow =
        file.tags.length > 0 ? (
            <div
                className="flex w-full min-w-0 items-center justify-center gap-1 overflow-hidden"
                onClick={(event) => event.stopPropagation()}
            >
                <span
                    className={cn(
                        'min-w-0 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                        useCoverLayout
                            ? 'bg-background/80 text-foreground'
                            : 'bg-muted text-muted-foreground',
                    )}
                >
                    {file.tags[0].name}
                </span>
                {file.tags.length > 1 && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className={cn(
                                        'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                                        useCoverLayout
                                            ? 'bg-background/80 text-foreground'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                    aria-label={`${file.tags.length - 1} more tags`}
                                >
                                    +{file.tags.length - 1}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {file.tags
                                    .slice(1)
                                    .map((tag) => tag.name)
                                    .join(', ')}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
        ) : null;

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>
                <div
                    draggable={canDrag && !isFolder && !isTrashed}
                    data-file-id={file.id}
                    data-testid={`file-card-${file.id}`}
                    className={cn(
                        'group relative aspect-square w-full min-w-0 overflow-hidden rounded-xl border transition-colors',
                        useCoverLayout
                            ? 'bg-muted/30'
                            : 'flex flex-col items-center bg-card p-3 hover:bg-muted/40',
                        'border-sidebar-border/70',
                        selected && 'ring-primary bg-muted/50 ring-2',
                        isDropTarget && 'ring-primary ring-2',
                        isTrashed && 'opacity-80',
                    )}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onContextMenu={() => onPrepareContextMenu(file)}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect(file.id, event);
                    }}
                    onDoubleClick={() => {
                        if (isFolder && !isTrashed) {
                            onOpenFolder(file.id);
                            return;
                        }

                        if (!isTrashed) {
                            onOpenDetails(file);
                        }
                    }}
                    onDragStart={(event) => {
                        if (isTrashed || isFolder) {
                            return;
                        }

                        onDragStart(file.id);
                        event.dataTransfer.setData(
                            INTERNAL_FILE_DRAG_TYPE,
                            String(file.id),
                        );
                    }}
                    onDragEnd={onDragEnd}
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
                        onDragOverFolder(file.id);
                    }}
                    onDragLeave={() => onDragLeaveFolder(file.id)}
                    onDrop={(event) => {
                        if (isTrashed || !isInternalFileDrag(event)) {
                            return;
                        }

                        event.preventDefault();
                        event.stopPropagation();

                        if (isFolder) {
                            onDropOnFolder(file.id);
                        }
                    }}
                >
                    {useCoverLayout && (
                        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                            <FilePreview
                                file={file}
                                hovered={hovered}
                                variant="cover"
                            />
                        </div>
                    )}

                    <div
                        className={cn(
                            'absolute top-2 left-2 z-20 transition-opacity',
                            showCheckbox ? 'opacity-100' : 'opacity-0',
                        )}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Checkbox
                            checked={selected}
                            onCheckedChange={() =>
                                onSelect(file.id, { metaKey: true })
                            }
                            aria-label={`Select ${file.name}`}
                        />
                    </div>

                    {file.is_favorited && (
                        <Star className="absolute top-2 right-2 z-20 size-3.5 fill-amber-400 text-amber-400 drop-shadow-sm" />
                    )}

                    {useCoverLayout ? (
                        <div className="absolute inset-x-0 bottom-0 z-10 min-w-0 bg-background/65 px-2.5 py-2 backdrop-blur-md">
                            <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                                {titleControl}
                                {tagsRow}
                            </div>
                        </div>
                    ) : (
                        <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
                            <div className="flex size-12 shrink-0 items-center justify-center">
                                <FilePreview file={file} hovered={hovered} />
                            </div>
                            {titleControl}
                            {tagsRow}
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {actions.map((action, index) => {
                    const Icon = action.icon;
                    const showSeparator =
                        firstDestructiveIndex > 0 &&
                        index === firstDestructiveIndex;

                    return (
                        <Fragment key={action.key}>
                            {showSeparator && <ContextMenuSeparator />}
                            <ContextMenuItem
                                variant={
                                    action.destructive
                                        ? 'destructive'
                                        : 'default'
                                }
                                onSelect={() => onAction(action.key, file)}
                            >
                                <Icon className="size-4" />
                                {action.label}
                            </ContextMenuItem>
                        </Fragment>
                    );
                })}
            </ContextMenuContent>
        </ContextMenu>
    );
}
