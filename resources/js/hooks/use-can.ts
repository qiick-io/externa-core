import { usePage } from '@inertiajs/react';
import { useCallback } from 'react';
import { userHasPermission } from '@/lib/permissions';
import type { Auth } from '@/types';

/**
 * Exposes permission checks against shared Inertia auth props.
 *
 * @returns `can(permission)` helper and the raw auth object
 */
export function useCan() {
    const { auth } = usePage<{ auth: Auth }>().props;

    const can = useCallback(
        (permission: string) => userHasPermission(permission, auth),
        [auth],
    );

    return { can, auth };
}
