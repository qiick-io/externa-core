/**
 * Validate a `return` query value for same-origin admin list restore.
 * Only relative `/collections/...` paths (plus query) are accepted.
 */
export function safeReturnUrl(
    candidate: string | null | undefined,
): string | null {
    if (!candidate || typeof candidate !== 'string') {
        return null;
    }

    let pathname: string;
    let search = '';

    try {
        if (/^https?:\/\//i.test(candidate) || candidate.startsWith('//')) {
            const origin =
                typeof window !== 'undefined'
                    ? window.location.origin
                    : 'http://localhost';
            const url = new URL(candidate, origin);

            if (typeof window !== 'undefined' && url.origin !== window.location.origin) {
                return null;
            }

            pathname = url.pathname;
            search = url.search;
        } else if (candidate.startsWith('/')) {
            const q = candidate.indexOf('?');
            pathname = q === -1 ? candidate : candidate.slice(0, q);
            search = q === -1 ? '' : candidate.slice(q);
        } else {
            return null;
        }
    } catch {
        return null;
    }

    if (!pathname.startsWith('/collections/') || pathname.includes('..')) {
        return null;
    }

    return pathname + search;
}

/** Current browser path + query for embedding as `return`. */
export function currentPathWithQuery(): string {
    if (typeof window === 'undefined') {
        return '/';
    }

    return window.location.pathname + window.location.search;
}

/** Append (or replace) `return` on a target URL. */
export function withReturnParam(targetUrl: string, returnUrl: string): string {
    const hashIndex = targetUrl.indexOf('#');
    const withoutHash =
        hashIndex === -1 ? targetUrl : targetUrl.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : targetUrl.slice(hashIndex);
    const qIndex = withoutHash.indexOf('?');
    const path = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex);
    const params = new URLSearchParams(
        qIndex === -1 ? '' : withoutHash.slice(qIndex + 1),
    );
    params.set('return', returnUrl);

    return `${path}?${params.toString()}${hash}`;
}

/** Read and validate `return` from an Inertia page URL (`/path?query`). */
export function readReturnParam(pageUrl: string): string | null {
    const qIndex = pageUrl.indexOf('?');
    if (qIndex === -1) {
        return null;
    }

    return safeReturnUrl(
        new URLSearchParams(pageUrl.slice(qIndex + 1)).get('return'),
    );
}
