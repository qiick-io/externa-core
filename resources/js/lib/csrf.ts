type CsrfHeader = {
    headerName: 'X-XSRF-TOKEN' | 'X-CSRF-TOKEN';
    token: string;
};

/**
 * Resolves the CSRF token and header name for same-origin fetch requests.
 * Prefers the `XSRF-TOKEN` cookie; falls back to the `csrf-token` meta tag.
 *
 * @returns Header name and token value (token may be empty when unavailable)
 */
export function getCsrfHeader(): CsrfHeader {
    const cookieMatch = document.cookie.match(/XSRF-TOKEN=([^;]+)/);

    if (cookieMatch) {
        return {
            headerName: 'X-XSRF-TOKEN',
            token: decodeURIComponent(cookieMatch[1]),
        };
    }

    const metaToken = document
        .querySelector('meta[name="csrf-token"]')
        ?.getAttribute('content');

    return {
        headerName: 'X-CSRF-TOKEN',
        token: metaToken ?? '',
    };
}

function csrfHeaders(): HeadersInit {
    const csrfHeader = getCsrfHeader();

    return {
        [csrfHeader.headerName]: csrfHeader.token,
    };
}

/**
 * Standard JSON fetch headers including CSRF and Inertia-friendly `Accept`.
 *
 * @returns Headers for JSON API requests
 */
export function jsonRequestHeaders(): HeadersInit {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...csrfHeaders(),
    };
}

/**
 * Multipart/form fetch headers including CSRF (no `Content-Type`; boundary is set by the browser).
 *
 * @returns Headers for form uploads
 */
export function formRequestHeaders(): HeadersInit {
    return {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...csrfHeaders(),
    };
}
