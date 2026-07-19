import type { Auth } from '@/types';

/** Minimal auth slice required for client-side permission checks. */
export type PermissionCheckAuth = Pick<
    Auth,
    'user' | 'permissions' | 'isSuperAdmin'
>;

/**
 * Returns whether the current auth context grants a named permission.
 * Super admins bypass individual permission checks.
 *
 * @param permission - Spatie permission name (e.g. `can-show-users`)
 * @param auth - Shared Inertia auth props, or null/undefined when logged out
 * @returns `true` when the user may perform the action
 */
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
