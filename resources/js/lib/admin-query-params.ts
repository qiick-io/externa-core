import { router } from '@inertiajs/react';

/** Current path + query from the browser (avoids stale Inertia URL). */
export function locationPageUrl(): string {
    if (typeof window === 'undefined') {
        return '/';
    }

    return window.location.pathname + window.location.search;
}

/** Read a query param from an Inertia page URL (`/path?query`). */
export function getQueryParam(pageUrl: string, key: string): string | null {
    const qIndex = pageUrl.indexOf('?');

    if (qIndex === -1) {
        return null;
    }

    return new URLSearchParams(pageUrl.slice(qIndex + 1)).get(key);
}

/**
 * Replace (or remove) a query param without losing other params.
 * Prefer history.replaceState (see replaceQueryParams).
 */
export function replaceQueryParam(
    pageUrl: string,
    key: string,
    value: string | null,
): void {
    replaceQueryParams(pageUrl, { [key]: value });
}

/** Set/clear multiple query params without a network round-trip.
 * Drawer/file deep-links only need a shareable URL; an Inertia `router.get`
 * here races open multi-select `fetch()` calls (browser connection limit) and
 * leaves pickers stuck on Loading….
 */
export function replaceQueryParams(
    pageUrl: string,
    updates: Record<string, string | null>,
): void {
    const qIndex = pageUrl.indexOf('?');
    const path = qIndex === -1 ? pageUrl : pageUrl.slice(0, qIndex);
    const params = new URLSearchParams(
        qIndex === -1 ? '' : pageUrl.slice(qIndex + 1),
    );

    for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
            params.delete(key);
        } else {
            params.set(key, value);
        }
    }

    const qs = params.toString();
    const next = qs === '' ? path : `${path}?${qs}`;
    const currentQs =
        qIndex === -1
            ? ''
            : new URLSearchParams(pageUrl.slice(qIndex + 1)).toString();
    const current = currentQs === '' ? path : `${path}?${currentQs}`;

    if (next === current) {
        return;
    }

    if (typeof window !== 'undefined') {
        window.history.replaceState(window.history.state ?? {}, '', next);

        return;
    }

    router.get(
        next,
        {},
        {
            replace: true,
            preserveState: true,
            preserveScroll: true,
        },
    );
}

/** Convenience: mutate current location query. */
export function patchLocationQuery(
    updates: Record<string, string | null>,
): void {
    replaceQueryParams(locationPageUrl(), updates);
}
