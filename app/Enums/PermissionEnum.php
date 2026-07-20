<?php

namespace App\Enums;

/**
 * Application permission names synced to the database and frontend enum.
 */
enum PermissionEnum: string
{
    case CanShowDashboard = 'can-show-dashboard';

    case CanShowUsers = 'can-show-users';
    case CanCreateUsers = 'can-create-users';
    case CanEditUsers = 'can-edit-users';
    case CanDeleteUsers = 'can-delete-users';
    case CanRestoreUsers = 'can-restore-users';
    case CanForceDeleteUsers = 'can-force-delete-users';

    case CanShowGroups = 'can-show-groups';
    case CanCreateGroups = 'can-create-groups';
    case CanEditGroups = 'can-edit-groups';
    case CanDeleteGroups = 'can-delete-groups';
    case CanRestoreGroups = 'can-restore-groups';
    case CanForceDeleteGroups = 'can-force-delete-groups';

    case CanShowRoles = 'can-show-roles';
    case CanCreateRoles = 'can-create-roles';
    case CanEditRoles = 'can-edit-roles';
    case CanDeleteRoles = 'can-delete-roles';

    case CanShowPermissions = 'can-show-permissions';
    case CanCreatePermissions = 'can-create-permissions';
    case CanEditPermissions = 'can-edit-permissions';
    case CanDeletePermissions = 'can-delete-permissions';

    case CanShowFiles = 'can-show-files';
    case CanCreateFiles = 'can-create-files';
    case CanEditFiles = 'can-edit-files';
    case CanDeleteFiles = 'can-delete-files';
    case CanRestoreFiles = 'can-restore-files';
    case CanForceDeleteFiles = 'can-force-delete-files';
    case CanDownloadFiles = 'can-download-files';
    case CanFavoriteFiles = 'can-favorite-files';
    case CanCopyFiles = 'can-copy-files';
    case CanReplaceFiles = 'can-replace-files';
    case CanTagFiles = 'can-tag-files';
    case CanUpdateFileMetadata = 'can-update-file-metadata';

    case CanShowCollections = 'can-show-collections';
    case CanCreateCollections = 'can-create-collections';
    case CanEditCollections = 'can-edit-collections';
    case CanDeleteCollections = 'can-delete-collections';
    case CanRestoreCollections = 'can-restore-collections';
    case CanForceDeleteCollections = 'can-force-delete-collections';

    case CanShowActivityLogs = 'can-show-activity-logs';

    case CanUseAi = 'can-use-ai';

    case CanManageProjectSettings = 'can-manage-project-settings';

    case CanShowApiKeys = 'can-show-api-keys';
    case CanManageApiKeys = 'can-manage-api-keys';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
