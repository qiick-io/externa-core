import { usePage } from '@inertiajs/react';
import { useCallback } from 'react';
import { userHasPermission } from '@/lib/permissions';
import type { Auth } from '@/types';

export function useCan() {
    const { auth } = usePage<{ auth: Auth }>().props;

    const can = useCallback(
        (permission: string) => userHasPermission(permission, auth),
        [auth],
    );

    return { can, auth };
}
