import { usePage } from '@inertiajs/react';
import { useEffect, useEffectEvent, useRef } from 'react';
import {
    getQueryParam,
    locationPageUrl,
    patchLocationQuery,
} from '@/lib/admin-query-params';

type UseDrawerDeepLinkOptions = {
    /** e.g. `edit` → `?edit=12` */
    editParam?: string;
    /** e.g. `new` → `?new=1` */
    newParam?: string;
    onEdit: (id: string) => void;
    onNew?: () => void;
};

/**
 * Open a drawer from URL query on first mount; helpers to keep the URL in sync.
 */
export function useDrawerDeepLink({
    editParam = 'edit',
    newParam = 'new',
    onEdit,
    onNew,
}: UseDrawerDeepLinkOptions): {
    syncEdit: (id: string | number) => void;
    syncNew: () => void;
    syncClosed: () => void;
} {
    const { url } = usePage();
    const booted = useRef(false);
    const onEditLatest = useEffectEvent(onEdit);
    const onNewLatest = useEffectEvent(onNew ?? (() => {}));

    useEffect(() => {
        if (booted.current) {
            return;
        }

        booted.current = true;
        const pageUrl = locationPageUrl() || url;
        const editVal = getQueryParam(pageUrl, editParam);

        if (editVal) {
            onEditLatest(editVal);

            return;
        }

        const newVal = getQueryParam(pageUrl, newParam);

        if (newVal === '1' || newVal === 'true') {
            onNewLatest();
        }
    }, [url, editParam, newParam]);

    return {
        syncEdit: (id) => {
            patchLocationQuery({
                [editParam]: String(id),
                [newParam]: null,
            });
        },
        syncNew: () => {
            patchLocationQuery({
                [editParam]: null,
                [newParam]: '1',
            });
        },
        syncClosed: () => {
            patchLocationQuery({
                [editParam]: null,
                [newParam]: null,
            });
        },
    };
}
