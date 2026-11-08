import { EllipsisVertical, Star, Tag } from 'lucide-react';
import { createElement, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import {
    INTERNAL_FILE_DRAG_TYPE,
    isInternalFileDrag,
} from '@/components/admin/file-dropzone';
import { FileActionMenuItems } from '@/components/admin/files/file-action-menu-items';
import {
    FilePreview,
    fileIconForExtension,
} from '@/components/admin/files/file-preview';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
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
    onSelect: (
        fileId: number,
        event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
    ) => void;
    onOpenFolder: (folderId: number) => void;
    /** Manager-only props below: the file picker leaves them out. */
    isDropTarget?: boolean;
    isTrashed?: boolean;
    canEdit?: boolean;
    canDrag?: boolean;
    /** Context menu actions; none renders the card without a context menu. */
    actions?: FileActionDefinition[];
    onOpenDetails?: (file: AdminFileRow) => void;
    onAction?: (action: FileActionKey, file: AdminFileRow) => void;
    onPrepareContextMenu?: (file: AdminFileRow) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    onDragOverFolder?: (folderId: number) => void;
    onDragLeaveFolder?: (folderId: number) => void;
    onDropOnFolder?: (folderId: number) => void;
};

/**
 * Single file or folder tile in the manager grid.
 *
 * The card surface is a plain container: mouse click selects, double click
 * opens, right-click shows the actions. It has no role or tab stop, so no
 * control sits inside another (axe nested-interactive). Keyboard users reach
 * the checkbox (select), the title button (select a file / open a folder) and,
 * on files, the tag and ⋮ menus. Also used by the file picker drawer, without
 * actions, drag and drop.
 */
export function FileCard({
    file,
    selected,
    multiSelectMode,
    isDropTarget = false,
    isTrashed = false,
    canEdit = false,
    canDrag = false,
    actions = [],
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
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const isFolder = file.type === 'folder';
    const showCheckbox = hovered || selected || multiSelectMode;
    const displayName = file.title || file.name;

    const titleControl =
        isFolder && !isTrashed ? (
            <button
                type="button"
                data-testid={`file-card-title-${file.id}`}
                className="block w-full min-w-0 truncate text-left text-sm leading-6 font-medium hover:underline"
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
                data-testid={`file-card-title-${file.id}`}
                className="block w-full min-w-0 truncate text-left text-sm leading-6 font-medium"
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect(file.id, event);
                }}
            >
                {displayName}
            </button>
        );

    // Always rendered (empty when untagged) so every card has the same
    // footer height and the grid rows line up.
    const tagsRow = (
        <div
            className="flex h-5 w-full min-w-0 items-center gap-1 overflow-hidden"
            data-test={`file-tags-${file.id}`}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {file.tags.length > 0 && (
                <Badge
                    variant="secondary"
                    className="block min-w-0 truncate text-xs"
                >
                    {file.tags[0].name}
                </Badge>
            )}
            {file.tags.length > 1 && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge
                            variant="secondary"
                            className="shrink-0 text-xs tabular-nums"
                            aria-label={t('files.tags.moreTags', {
                                count: file.tags.length - 1,
                            })}
                        >
                            +{file.tags.length - 1}
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                        {file.tags
                            .slice(1)
                            .map((tag) => tag.name)
                            .join(', ')}
                    </TooltipContent>
                </Tooltip>
            )}
        </div>
    );

    const surfaceClassName = cn(
        'group overflow-hidden rounded-xl border border-sidebar-border/70 bg-card transition-colors hover:bg-muted/40',
        // The selection ring is drawn by an inset overlay above the cover
        // media: an outer ring-2 is cut by the grid's scroll container on the
        // outer columns and rows.
        (selected || isDropTarget) &&
            'after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-xl after:ring-2 after:ring-primary after:ring-inset',
        selected && 'bg-muted/50',
        isTrashed && 'opacity-80',
    );

    const surfaceProps: HTMLAttributes<HTMLDivElement> & {
        'data-file-id': number;
        'data-testid': string;
        'data-selected': boolean;
    } = {
        draggable: canDrag && !isFolder && !isTrashed,
        'data-file-id': file.id,
        'data-testid': `file-card-${file.id}`,
        'data-selected': selected,
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        onContextMenu: () => onPrepareContextMenu?.(file),
        onClick: (event) => {
            event.stopPropagation();
            onSelect(file.id, event);
        },
        onDoubleClick: () => {
            if (isFolder && !isTrashed) {
                onOpenFolder(file.id);

                return;
            }

            if (!isTrashed) {
                onOpenDetails?.(file);
            }
        },
        onDragStart: (event) => {
            if (isTrashed || isFolder) {
                return;
            }

            onDragStart?.(file.id);
            event.dataTransfer.setData(
                INTERNAL_FILE_DRAG_TYPE,
                String(file.id),
            );
        },
        onDragEnd: () => onDragEnd?.(),
        onDragOver: (event) => {
            if (
                !isFolder ||
                !canEdit ||
                isTrashed ||
                !isInternalFileDrag(event)
            ) {
                return;
            }

            event.preventDefault();
            onDragOverFolder?.(file.id);
        },
        onDragLeave: () => onDragLeaveFolder?.(file.id),
        onDrop: (event) => {
            if (isTrashed || !isInternalFileDrag(event)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (isFolder) {
                onDropOnFolder?.(file.id);
            }
        },
    };

    const selectionCheckbox = (
        <div
            className={cn(
                'absolute top-2 left-2 z-20 transition-opacity',
                showCheckbox
                    ? 'opacity-100'
                    : 'opacity-0 focus-within:opacity-100',
            )}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <Checkbox
                checked={selected}
                onClick={(event) => {
                    // Keep the card's select-only click from replacing the multi-selection (#464).
                    event.stopPropagation();

                    if (event.shiftKey) {
                        event.preventDefault();
                        onSelect(file.id, { shiftKey: true });
                    }
                }}
                onCheckedChange={() => onSelect(file.id, { metaKey: true })}
                aria-label={t('files.card.select', {
                    name: file.name,
                })}
            />
        </div>
    );

    const statusMarks = (
        <>
            {file.is_favorited && (
                <Star className="absolute top-2 right-2 z-20 size-3.5 fill-amber-400 text-amber-400 drop-shadow-sm" />
            )}

            {file.effective_access === 'private' && (
                <Badge
                    variant="outline"
                    className="absolute bottom-2 left-2 z-20 bg-background/90 text-muted-foreground shadow-sm"
                    title={t('files.card.privateTitle')}
                >
                    {t('files.card.privateBadge')}
                </Badge>
            )}
        </>
    );

    // Menu buttons in the file footer: they prepare the selection like a
    // right-click does, and keep their clicks off the card surface.
    const menuTriggerProps = {
        onPointerDown: () => onPrepareContextMenu?.(file),
        onClick: (event: { stopPropagation: () => void }) =>
            event.stopPropagation(),
        onDoubleClick: (event: { stopPropagation: () => void }) =>
            event.stopPropagation(),
    };
    const tagAction = actions.find((action) => action.key === 'tag');
    const typeIcon = fileIconForExtension(
        file.extension || file.name.split('.').pop() || '',
    );

    const card = isFolder ? (
        <div
            {...surfaceProps}
            className={cn(
                'relative flex w-full min-w-0 flex-col',
                surfaceClassName,
            )}
        >
            {/* Folder: the icon in a square, name and tags below. */}
            <AspectRatio
                ratio={1}
                className="flex items-center justify-center overflow-hidden bg-muted/20"
            >
                <div className="flex size-12 items-center justify-center">
                    <FilePreview file={file} hovered={hovered} />
                </div>
                {selectionCheckbox}
                {statusMarks}
            </AspectRatio>

            <div className="flex min-w-0 flex-col gap-1 border-t border-sidebar-border/70 px-2.5 py-2">
                <Tooltip>
                    <TooltipTrigger asChild>{titleControl}</TooltipTrigger>
                    <TooltipContent>{displayName}</TooltipContent>
                </Tooltip>
                {tagsRow}
            </div>
        </div>
    ) : (
        <AspectRatio
            ratio={1}
            {...surfaceProps}
            className={cn('flex min-w-0 flex-col', surfaceClassName)}
        >
            {/* File: the whole card is square. The preview fills the top
                edge to edge; the type icon, name and menus sit below it. */}
            <div
                data-test={`file-card-preview-${file.id}`}
                className="relative min-h-0 flex-1 overflow-hidden bg-muted/30"
            >
                <FilePreview file={file} hovered={hovered} variant="cover" />
                {selectionCheckbox}
                {statusMarks}
            </div>

            <div
                data-test={`file-card-header-${file.id}`}
                className="flex h-10 shrink-0 items-center gap-1.5 border-t border-sidebar-border/70 pr-1 pl-2.5"
            >
                {createElement(typeIcon, {
                    className: 'size-4 shrink-0 text-muted-foreground',
                    'aria-hidden': true,
                })}
                <Tooltip>
                    <TooltipTrigger asChild>{titleControl}</TooltipTrigger>
                    <TooltipContent>{displayName}</TooltipContent>
                </Tooltip>

                {file.tags.length > 0 && (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-muted-foreground"
                                data-test={`file-tags-${file.id}`}
                                aria-label={t('files.card.tagsMenu', {
                                    count: file.tags.length,
                                    name: displayName,
                                })}
                                {...menuTriggerProps}
                            >
                                <Tag />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-w-64">
                            <DropdownMenuLabel>
                                {t('files.tags.label')}
                            </DropdownMenuLabel>
                            {file.tags.map((tag) => (
                                <DropdownMenuItem
                                    key={tag.id}
                                    data-test="file-tags-item"
                                >
                                    <Tag />
                                    <span className="truncate">{tag.name}</span>
                                </DropdownMenuItem>
                            ))}
                            {tagAction && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onSelect={() =>
                                            onAction?.(tagAction.key, file)
                                        }
                                    >
                                        <tagAction.icon />
                                        {tagAction.label}
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {actions.length > 0 && (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-muted-foreground"
                                data-test={`file-card-more-${file.id}`}
                                aria-label={t('files.card.moreActions', {
                                    name: displayName,
                                })}
                                {...menuTriggerProps}
                            >
                                <EllipsisVertical />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <FileActionMenuItems
                                actions={actions}
                                onAction={(key) => onAction?.(key, file)}
                                item={DropdownMenuItem}
                                separator={DropdownMenuSeparator}
                            />
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </AspectRatio>
    );

    if (actions.length === 0) {
        return card;
    }

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
            <ContextMenuContent>
                <FileActionMenuItems
                    actions={actions}
                    onAction={(key) => onAction?.(key, file)}
                    item={ContextMenuItem}
                    separator={ContextMenuSeparator}
                />
            </ContextMenuContent>
        </ContextMenu>
    );
}
