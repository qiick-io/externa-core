import { queryParams, type RouteQueryOptions } from '@/wayfinder';

function url(path: string, options?: RouteQueryOptions): string {
    return path + queryParams(options);
}

/** Root admin URLs — replace with Wayfinder routes when generated */
const adminRoutes = {
    users: {
        index: (options?: RouteQueryOptions) => url('/users', options),
        store: () => url('/users'),
        update: (user: number | { user: number }) =>
            url(
                `/users/${typeof user === 'number' ? user : user.user}`,
            ),
        destroy: (user: number | { user: number }) =>
            url(
                `/users/${typeof user === 'number' ? user : user.user}`,
            ),
        restore: (user: number | { user: number }) =>
            url(
                `/users/${typeof user === 'number' ? user : user.user}/restore`,
            ),
        forceDelete: (user: number | { user: number }) =>
            url(
                `/users/${typeof user === 'number' ? user : user.user}/force`,
            ),
        bulkActions: () => url('/users/bulk-actions'),
    },
    groups: {
        index: (options?: RouteQueryOptions) => url('/groups', options),
        store: () => url('/groups'),
        update: (group: number | { group: number }) =>
            url(
                `/groups/${typeof group === 'number' ? group : group.group}`,
            ),
        destroy: (group: number | { group: number }) =>
            url(
                `/groups/${typeof group === 'number' ? group : group.group}`,
            ),
        bulkDestroy: () => url('/groups/bulk/destroy'),
    },
    roles: {
        index: (options?: RouteQueryOptions) => url('/roles', options),
        create: () => url('/roles/create'),
        edit: (role: number | { role: number }) =>
            url(
                `/roles/${typeof role === 'number' ? role : role.role}/edit`,
            ),
        store: () => url('/roles'),
        update: (role: number | { role: number }) =>
            url(
                `/roles/${typeof role === 'number' ? role : role.role}`,
            ),
        destroy: (role: number | { role: number }) =>
            url(
                `/roles/${typeof role === 'number' ? role : role.role}`,
            ),
        bulkActions: () => url('/roles/bulk-actions'),
    },
    permissions: {
        index: (options?: RouteQueryOptions) => url('/permissions', options),
        sync: () => url('/permissions/sync'),
    },
    files: {
        index: (options?: RouteQueryOptions) => url('/files', options),
        list: (options?: RouteQueryOptions) => url('/files/list', options),
        createFolder: () => url('/files/folders'),
        upload: () => url('/files/upload'),
        move: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/move`,
            ),
        rename: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/rename`,
            ),
        destroy: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}`,
            ),
        restore: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/restore`,
            ),
        forceDelete: (file: number | { file: number }) =>
            url(
                `/files/${typeof file === 'number' ? file : file.file}/force`,
            ),
        uploadsInit: () => url('/files/uploads/init'),
        uploadsChunk: () => url('/files/uploads/chunk'),
        uploadsComplete: () => url('/files/uploads/complete'),
        uploadsStatus: (options?: RouteQueryOptions) =>
            url('/files/uploads/status', options),
    },
} as const;

export default adminRoutes;
