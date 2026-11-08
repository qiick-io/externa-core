import { EllipsisVertical, Star, Tag } from 'lucide-react';
import { useState } from 'react';
import type { HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import {
    INTERNAL_FILE_DRAG_TYPE,
    isInternalFileDrag,
} from '@/components/admin/file-dropzone';
import { FileActionMenuItems } from '@/components/admin/files/file-action-menu-items';
import { FilePreview } from '@/components/admin/files/file-preview';
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/components/ui/hover-card';
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
                <Star className="absolute top-2 right-2 z-20 size-3.5 fill-favorite text-favorite drop-shadow-sm" />
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

    const card = (
        <AspectRatio
            ratio={1}
            {...surfaceProps}
            className={cn('flex min-w-0 flex-col', surfaceClassName)}
        >
            {/* The whole card is square (files and folders alike): the
                preview fills the space above the 40px name row, edge to
                edge. */}
            <div
                data-test={`file-card-preview-${file.id}`}
                className={cn(
                    'relative min-h-0 flex-1 overflow-hidden bg-muted/30',
                    // Same tile and glyph size as the type icon on file cards.
                    isFolder && 'flex items-center justify-center bg-muted',
                )}
            >
                {isFolder ? (
                    <div className="flex size-1/3 items-center justify-center">
                        <FilePreview
                            file={file}
                            hovered={hovered}
                            className="size-full"
                        />
                    </div>
                ) : (
                    <FilePreview
                        file={file}
                        hovered={hovered}
                        variant="cover"
                    />
                )}
                {selectionCheckbox}
                {statusMarks}
            </div>

            <div
                data-test={`file-card-header-${file.id}`}
                className="flex h-10 shrink-0 items-center gap-1 border-t border-sidebar-border/70 pr-1 pl-2.5"
            >
                <Tooltip>
                    <TooltipTrigger asChild>{titleControl}</TooltipTrigger>
                    <TooltipContent>{displayName}</TooltipContent>
                </Tooltip>

                {file.tags.length > 0 && (
                    // Hover or focus shows the tags; a click neither opens a
                    // menu nor selects the card.
                    <HoverCard openDelay={150} closeDelay={100}>
                        <HoverCardTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="shrink-0 text-muted-foreground"
                                data-test={`file-tags-${file.id}`}
                                aria-label={t('files.card.tagsMenu', {
                                    count: file.tags.length,
                                    name: displayName,
                                })}
                                onClick={(event) => event.stopPropagation()}
                                onDoubleClick={(event) =>
                                    event.stopPropagation()
                                }
                            >
                                <Tag />
                            </Button>
                        </HoverCardTrigger>
                        <HoverCardContent
                            align="end"
                            className="w-auto max-w-64 p-2"
                            data-test={`file-tags-card-${file.id}`}
                        >
                            <div className="flex flex-wrap gap-1">
                                {file.tags.map((tag) => (
                                    <Badge
                                        key={tag.id}
                                        variant="secondary"
                                        className="max-w-full truncate"
                                        data-test="file-tags-item"
                                    >
                                        {tag.name}
                                    </Badge>
                                ))}
                            </div>
                        </HoverCardContent>
                    </HoverCard>
                )}

                {actions.length > 0 && (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
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
