import {
    Copy,
    Download,
    FolderInput,
    Info,
    Pencil,
    RefreshCw,
    RotateCcw,
    Star,
    StarOff,
    Tags,
    Trash2,
} from 'lucide-react';
import type {
    AdminFileRow,
    FileActionDefinition,
    FileActionKey,
} from '@/types/files';

export type FileActionPermissions = {
    canEdit: boolean;
    canDelete: boolean;
    canRestore: boolean;
    canForceDelete: boolean;
    canDownload: boolean;
    canFavorite: boolean;
    canCopy: boolean;
    canReplace: boolean;
    canTag: boolean;
    canUpdateMetadata: boolean;
};

const ACTION_ICONS: Record<FileActionKey, FileActionDefinition['icon']> = {
    details: Info,
    download: Download,
    move: FolderInput,
    rename: Pencil,
    duplicate: Copy,
    favorite: Star,
    unfavorite: StarOff,
    replace: RefreshCw,
    tag: Tags,
    delete: Trash2,
    restore: RotateCcw,
    force_delete: Trash2,
};

/**
 * Single source of truth for file manager actions (toolbar + context menu).
 * @param {AdminFileRow[]} selected - Currently selected file rows.
 * @param {FileActionPermissions} permissions - Capability flags for the current user.
 * @param {boolean} isTrashed - Whether the view shows trashed items.
 * @returns {FileActionDefinition[]} Ordered actions available for the selection.
 */
export function resolveFileActions(
    selected: AdminFileRow[],
    permissions: FileActionPermissions,
    isTrashed: boolean,
): FileActionDefinition[] {
    if (selected.length === 0) {
        return [];
    }

    const exactlyOne = selected.length === 1;
    const onlyFiles = selected.every((file) => file.type === 'file');
    const anyFavorited = selected.some((file) => file.is_favorited);
    const anyUnfavorited = selected.some((file) => !file.is_favorited);

    const candidates: Array<FileActionDefinition & { available: boolean }> = [
        {
            key: 'details',
            label: 'Details',
            icon: ACTION_ICONS.details,
            available: exactlyOne && !isTrashed,
        },
        {
            key: 'download',
            label: selected.length > 1 || !onlyFiles ? 'Download zip' : 'Download',
            icon: ACTION_ICONS.download,
            available: permissions.canDownload && !isTrashed,
        },
        {
            key: 'move',
            label: 'Move',
            icon: ACTION_ICONS.move,
            available: permissions.canEdit && !isTrashed,
        },
        {
            key: 'rename',
            label: 'Rename',
            icon: ACTION_ICONS.rename,
            available: exactlyOne && permissions.canEdit && !isTrashed,
        },
        {
            key: 'duplicate',
            label: 'Duplicate',
            icon: ACTION_ICONS.duplicate,
            available: permissions.canCopy && !isTrashed,
        },
        {
            key: 'favorite',
            label: 'Favorite',
            icon: ACTION_ICONS.favorite,
            available: permissions.canFavorite && !isTrashed && anyUnfavorited,
        },
        {
            key: 'unfavorite',
            label: 'Unfavorite',
            icon: ACTION_ICONS.unfavorite,
            available: permissions.canFavorite && !isTrashed && anyFavorited,
        },
        {
            key: 'replace',
            label: 'Replace',
            icon: ACTION_ICONS.replace,
            available:
                exactlyOne &&
                onlyFiles &&
                permissions.canReplace &&
                !isTrashed,
        },
        {
            key: 'tag',
            label: 'Tag',
            icon: ACTION_ICONS.tag,
            available: permissions.canTag && !isTrashed,
        },
        {
            key: 'delete',
            label: 'Delete',
            icon: ACTION_ICONS.delete,
            destructive: true,
            available: permissions.canDelete && !isTrashed,
        },
        {
            key: 'restore',
            label: 'Restore',
            icon: ACTION_ICONS.restore,
            available: permissions.canRestore && isTrashed,
        },
        {
            key: 'force_delete',
            label: 'Delete forever',
            icon: ACTION_ICONS.force_delete,
            destructive: true,
            available: permissions.canForceDelete && isTrashed,
        },
    ];

    return candidates
        .filter((action) => action.available)
        .map(({ key, label, icon, destructive }) => ({
            key,
            label,
            icon,
            destructive,
        }));
}

/**
 * Resolves context-menu targets using drive-like selection semantics.
 * @param {AdminFileRow} file - File row that was right-clicked.
 * @param {number[]} selectedIds - IDs in the current selection.
 * @param {AdminFileRow[]} selectedFiles - Full rows for the current selection.
 * @returns {AdminFileRow[]} Rows the context menu should act on.
 */
export function resolveContextMenuTargets(
    file: AdminFileRow,
    selectedIds: number[],
    selectedFiles: AdminFileRow[],
): AdminFileRow[] {
    return selectedIds.includes(file.id) ? selectedFiles : [file];
}
