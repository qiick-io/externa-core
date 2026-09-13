import type { TFunction } from 'i18next';
import {
    Copy,
    Download,
    FolderInput,
    Info,
    Pencil,
    RefreshCw,
    RotateCcw,
    Sparkles,
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
    canUseAi?: boolean;
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
    ask_ai: Sparkles,
    delete: Trash2,
    restore: RotateCcw,
    force_delete: Trash2,
};

/**
 * Single source of truth for file manager actions (toolbar + context menu).
 * @param {AdminFileRow[]} selected - Currently selected file rows.
 * @param {FileActionPermissions} permissions - Capability flags for the current user.
 * @param {boolean} isTrashed - Whether the view shows trashed items.
 * @param {TFunction} t - i18n translate function.
 * @returns {FileActionDefinition[]} Ordered actions available for the selection.
 */
export function resolveFileActions(
    selected: AdminFileRow[],
    permissions: FileActionPermissions,
    isTrashed: boolean,
    t: TFunction,
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
            label: t('files.actions.details'),
            icon: ACTION_ICONS.details,
            available: exactlyOne && !isTrashed,
        },
        {
            key: 'download',
            label:
                selected.length > 1 || !onlyFiles
                    ? t('files.actions.downloadZip')
                    : t('files.actions.download'),
            icon: ACTION_ICONS.download,
            available: permissions.canDownload && !isTrashed,
        },
        {
            key: 'move',
            label: t('files.actions.move'),
            icon: ACTION_ICONS.move,
            available: permissions.canEdit && !isTrashed,
        },
        {
            key: 'rename',
            label: t('files.actions.rename'),
            icon: ACTION_ICONS.rename,
            available: exactlyOne && permissions.canEdit && !isTrashed,
        },
        {
            key: 'duplicate',
            label: t('files.actions.duplicate'),
            icon: ACTION_ICONS.duplicate,
            available: permissions.canCopy && !isTrashed,
        },
        {
            key: 'favorite',
            label: t('files.actions.favorite'),
            icon: ACTION_ICONS.favorite,
            available: permissions.canFavorite && !isTrashed && anyUnfavorited,
        },
        {
            key: 'unfavorite',
            label: t('files.actions.unfavorite'),
            icon: ACTION_ICONS.unfavorite,
            available: permissions.canFavorite && !isTrashed && anyFavorited,
        },
        {
            key: 'replace',
            label: t('files.actions.replace'),
            icon: ACTION_ICONS.replace,
            available:
                exactlyOne && onlyFiles && permissions.canReplace && !isTrashed,
        },
        {
            key: 'tag',
            label: t('files.actions.tag'),
            icon: ACTION_ICONS.tag,
            available: permissions.canTag && !isTrashed,
        },
        {
            key: 'ask_ai',
            label: t('files.actions.askAi'),
            icon: ACTION_ICONS.ask_ai,
            available: Boolean(permissions.canUseAi),
        },
        {
            key: 'delete',
            label: t('common.delete'),
            icon: ACTION_ICONS.delete,
            destructive: true,
            available: permissions.canDelete && !isTrashed,
        },
        {
            key: 'restore',
            label: t('files.actions.restore'),
            icon: ACTION_ICONS.restore,
            available: permissions.canRestore && isTrashed,
        },
        {
            key: 'force_delete',
            label: t('files.actions.forceDelete'),
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
