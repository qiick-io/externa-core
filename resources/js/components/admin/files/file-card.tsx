import { Star } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    INTERNAL_FILE_DRAG_TYPE,
    isInternalFileDrag,
} from '@/components/admin/file-dropzone';
import {
    FilePreview,
    hasCoverMedia,
} from '@/components/admin/files/file-preview';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
 * Nested interactive pattern: the card surface handles selection / open via
 * click handlers; title is a separate native `<button>`; checkbox and context
 * menu actions are siblings (not nested inside each other) so keyboard and
 * screen-reader users can reach each control independently. Also used by the
 * file picker drawer, without actions, drag and drop.
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
    const useCoverLayout = hasCoverMedia(file);
    const showCheckbox = hovered || selected || multiSelectMode;
    const firstDestructiveIndex = actions.findIndex(
        (action) => action.destructive,
    );
    const displayName = file.title || file.name;

    const titleControl =
        isFolder && !isTrashed ? (
            <button
                type="button"
                data-testid={`file-card-title-${file.id}`}
                className="block w-full min-w-0 truncate text-left text-sm leading-5 font-medium hover:underline"
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
                className="block w-full min-w-0 truncate text-left text-sm leading-5 font-medium"
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

    const card = (
        <div
            draggable={canDrag && !isFolder && !isTrashed}
            data-file-id={file.id}
            data-testid={`file-card-${file.id}`}
            className={cn(
                'group relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-sidebar-border/70 bg-card transition-colors hover:bg-muted/40',
                // The selection ring is drawn by an inset overlay above the
                // cover media: an outer ring-2 is cut by the grid's scroll
                // container on the outer columns and rows.
                (selected || isDropTarget) &&
                    'after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-xl after:ring-2 after:ring-primary after:ring-inset',
                selected && 'bg-muted/50',
                isTrashed && 'opacity-80',
            )}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onContextMenu={() => onPrepareContextMenu?.(file)}
            onClick={(event) => {
                event.stopPropagation();
                onSelect(file.id, event);
            }}
            onKeyDown={(event) => {
                // Nested controls (checkbox, title) handle their own keys.
                if (
                    event.target !== event.currentTarget ||
                    (event.key !== 'Enter' && event.key !== ' ')
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                onSelect(file.id, event);
            }}
            onDoubleClick={() => {
                if (isFolder && !isTrashed) {
                    onOpenFolder(file.id);

                    return;
                }

                if (!isTrashed) {
                    onOpenDetails?.(file);
                }
            }}
            onDragStart={(event) => {
                if (isTrashed || isFolder) {
                    return;
                }

                onDragStart?.(file.id);
                event.dataTransfer.setData(
                    INTERNAL_FILE_DRAG_TYPE,
                    String(file.id),
                );
            }}
            onDragEnd={() => onDragEnd?.()}
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
                onDragOverFolder?.(file.id);
            }}
            onDragLeave={() => onDragLeaveFolder?.(file.id)}
            onDrop={(event) => {
                if (isTrashed || !isInternalFileDrag(event)) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                if (isFolder) {
                    onDropOnFolder?.(file.id);
                }
            }}
        >
            {/* Preview: the image (or the type icon) with nothing over it
                but the selection controls; name and tags sit below. */}
            <AspectRatio
                ratio={1}
                className={cn(
                    'overflow-hidden',
                    useCoverLayout
                        ? 'bg-muted/30'
                        : 'flex items-center justify-center bg-muted/20',
                )}
            >
                {useCoverLayout ? (
                    <FilePreview
                        file={file}
                        hovered={hovered}
                        variant="cover"
                    />
                ) : (
                    <div className="flex size-12 items-center justify-center">
                        <FilePreview file={file} hovered={hovered} />
                    </div>
                )}

                <div
                    className={cn(
                        'absolute top-2 left-2 z-20 transition-opacity',
                        showCheckbox ? 'opacity-100' : 'opacity-0',
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
                        onCheckedChange={() =>
                            onSelect(file.id, { metaKey: true })
                        }
                        aria-label={t('files.card.select', {
                            name: file.name,
                        })}
                    />
                </div>

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
            </AspectRatio>

            <div className="flex min-w-0 flex-col gap-1 border-t border-sidebar-border/70 px-2.5 py-2">
                <Tooltip>
                    <TooltipTrigger asChild>{titleControl}</TooltipTrigger>
                    <TooltipContent>{displayName}</TooltipContent>
                </Tooltip>
                {tagsRow}
            </div>
        </div>
    );

    if (actions.length === 0) {
        return card;
    }

    return (
        <ContextMenu modal={false}>
            <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
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
                                data-testid={`files-context-action-${action.key}`}
                                disabled={Boolean(action.disabledReason)}
                                title={action.disabledReason}
                                onSelect={() => onAction?.(action.key, file)}
                            >
                                <Icon className="size-4" />
                                {action.disabledReason ? (
                                    <span className="flex flex-col">
                                        {action.label}
                                        <span className="text-xs text-muted-foreground">
                                            {action.disabledReason}
                                        </span>
                                    </span>
                                ) : (
                                    action.label
                                )}
                            </ContextMenuItem>
                        </Fragment>
                    );
                })}
            </ContextMenuContent>
        </ContextMenu>
    );
}
