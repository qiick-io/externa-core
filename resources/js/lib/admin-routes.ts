import { queryParams } from '@/wayfinder';
import type { RouteQueryOptions } from '@/wayfinder';

/**
 * Builds an admin URL with optional Wayfinder query parameters.
 *
 * @param path - Absolute path under the admin prefix
 * @param options - Optional query string options
 * @returns Full URL string
 */
function url(path: string, options?: RouteQueryOptions): string {
    return path + queryParams(options);
}

/**
 * Hand-maintained admin route URLs until Wayfinder generates equivalent helpers.
 * Mirrors Laravel admin routes for users, groups, roles, permissions, activity logs, and files.
 */
const adminRoutes = {
    users: {
        index: (options?: RouteQueryOptions) => url('/users', options),
        store: () => url('/users'),
        update: (user: number | { user: number }) =>
            url(`/users/${typeof user === 'number' ? user : user.user}`),
        destroy: (user: number | { user: number }) =>
            url(`/users/${typeof user === 'number' ? user : user.user}`),
        restore: (user: number | { user: number }) =>
            url(
                `/users/${typeof user === 'number' ? user : user.user}/restore`,
            ),
        forceDelete: (user: number | { user: number }) =>
            url(`/users/${typeof user === 'number' ? user : user.user}/force`),
        bulkActions: () => url('/users/bulk-actions'),
    },
    groups: {
        index: (options?: RouteQueryOptions) => url('/groups', options),
        store: () => url('/groups'),
        update: (group: number | { group: number }) =>
            url(`/groups/${typeof group === 'number' ? group : group.group}`),
        destroy: (group: number | { group: number }) =>
            url(`/groups/${typeof group === 'number' ? group : group.group}`),
        restore: (group: number | { group: number }) =>
            url(
                `/groups/${typeof group === 'number' ? group : group.group}/restore`,
            ),
        forceDelete: (group: number | { group: number }) =>
            url(
                `/groups/${typeof group === 'number' ? group : group.group}/force`,
            ),
        bulkActions: () => url('/groups/bulk-actions'),
    },
    roles: {
        index: (options?: RouteQueryOptions) => url('/settings/roles', options),
        create: () => url('/settings/roles/create'),
        edit: (role: number | { role: number }) =>
            url(
                `/settings/roles/${typeof role === 'number' ? role : role.role}/edit`,
            ),
        store: () => url('/settings/roles'),
        update: (role: number | { role: number }) =>
            url(
                `/settings/roles/${typeof role === 'number' ? role : role.role}`,
            ),
        destroy: (role: number | { role: number }) =>
            url(
                `/settings/roles/${typeof role === 'number' ? role : role.role}`,
            ),
        bulkActions: () => url('/settings/roles/bulk-actions'),
    },
    apiKeys: {
        index: (options?: RouteQueryOptions) =>
            url('/settings/api-keys', options),
        store: () => url('/settings/api-keys'),
        destroy: (apiKey: number | { apiKey: number }) =>
            url(
                `/settings/api-keys/${typeof apiKey === 'number' ? apiKey : apiKey.apiKey}`,
            ),
    },
    permissions: {
        index: (options?: RouteQueryOptions) =>
            url('/settings/permissions', options),
        sync: () => url('/settings/permissions/sync'),
    },
    activityLogs: {
        index: (options?: RouteQueryOptions) => url('/activity-logs', options),
    },
    files: {
        index: (
            folderOrOptions?:
                number | { folder: number } | RouteQueryOptions | null,
            options?: RouteQueryOptions,
        ) => {
            if (typeof folderOrOptions === 'number') {
                return url(`/files/${folderOrOptions}`, options);
            }

            if (
                folderOrOptions &&
                typeof folderOrOptions === 'object' &&
                'folder' in folderOrOptions &&
                folderOrOptions.folder != null
            ) {
                const { folder, ...routeOptions } = folderOrOptions as {
                    folder: number;
                } & RouteQueryOptions;

                return url(
                    `/files/${folder}`,
                    Object.keys(routeOptions).length > 0
                        ? routeOptions
                        : options,
                );
            }

            return url(
                '/files',
                (folderOrOptions as RouteQueryOptions | undefined) ?? options,
            );
        },
        list: (options?: RouteQueryOptions) => url('/files/list', options),
        tagsCatalog: () => url('/files/tags'),
        createFolder: () => url('/files/folders'),
        upload: () => url('/files/upload'),
        importUrl: () => url('/files/import-url'),
        bulk: () => url('/files/bulk'),
        downloadMany: () => url('/files/download'),
        downloadZip: (jobId: string) => url(`/files/zips/${jobId}`),
        update: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}`),
        replace: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/replace`,
            ),
        copy: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}/copy`),
        favorite: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/favorite`,
            ),
        tags: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}/tags`),
        download: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/download`,
            ),
        whereUsed: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/where-used`,
            ),
        move: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}/move`),
        rename: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}/rename`),
        destroy: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}`),
        restore: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/restore`,
            ),
        forceDelete: (file: number | { file: number }) =>
            url(`/files/${typeof file === 'number' ? file : file.file}/force`),
        uploadsInit: () => url('/files/uploads/init'),
        uploadsChunk: () => url('/files/uploads/chunk'),
        uploadsComplete: () => url('/files/uploads/complete'),
        uploadsStatus: (options?: RouteQueryOptions) =>
            url('/files/uploads/status', options),
    },
} as const;

export default adminRoutes;
