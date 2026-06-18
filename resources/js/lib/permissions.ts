import type { Auth } from '@/types';

export type PermissionCheckAuth = Pick<
    Auth,
    'user' | 'permissions' | 'isSuperAdmin'
>;

export function userHasPermission(
    permission: string,
    auth: PermissionCheckAuth | null | undefined,
): boolean {
    if (!auth?.user) {
        return false;
    }

    if (auth.isSuperAdmin) {
        return true;
    }

    const permissions = auth.permissions ?? [];

    return permissions.includes(permission);
}
