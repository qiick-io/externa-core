import { useMemo } from 'react';
import type { FileActionPermissions } from '@/components/admin/files/file-actions';
import { PermissionEnum } from '@/enums/permission-enum';
import { useAiAvailability } from '@/hooks/use-ai-availability';
import { useCan } from '@/hooks/use-can';

/**
 * Resolves the signed-in user's file manager permissions once, as flags for
 * the page and as the `FileActionPermissions` the action menus are built from.
 *
 * The UI only hides what the user cannot do; the server check is the one
 * that counts.
 */
export function useFilesPermissions() {
    const { can } = useCan();
    const canCreate = can(PermissionEnum.CanCreateFiles);
    const canEdit = can(PermissionEnum.CanEditFiles);
    const canDelete = can(PermissionEnum.CanDeleteFiles);
    const canRestore = can(PermissionEnum.CanRestoreFiles);
    const canForceDelete = can(PermissionEnum.CanForceDeleteFiles);
    const canDownload = can(PermissionEnum.CanDownloadFiles);
    const canFavorite = can(PermissionEnum.CanFavoriteFiles);
    const canCopy = can(PermissionEnum.CanCopyFiles);
    const canReplace = can(PermissionEnum.CanReplaceFiles);
    const canTag = can(PermissionEnum.CanTagFiles);
    const canUpdateMetadata = can(PermissionEnum.CanUpdateFileMetadata);
    const canUseAi = can(PermissionEnum.CanUseAi);
    const { isAvailable: isAiAvailable } = useAiAvailability();

    const actionPermissions: FileActionPermissions = useMemo(
        () => ({
            canEdit,
            canDelete,
            canRestore,
            canForceDelete,
            canDownload,
            canFavorite,
            canCopy,
            canReplace,
            canTag,
            canUpdateMetadata,
            canUseAi,
            isAiAvailable,
        }),
        [
            canEdit,
            canDelete,
            canRestore,
            canForceDelete,
            canDownload,
            canFavorite,
            canCopy,
            canReplace,
            canTag,
            canUpdateMetadata,
            canUseAi,
            isAiAvailable,
        ],
    );

    return {
        canCreate,
        canEdit,
        canForceDelete,
        canReplace,
        canTag,
        canUpdateMetadata,
        isAiAvailable,
        actionPermissions,
    };
}
