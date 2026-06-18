type CsrfHeader = {
    headerName: 'X-XSRF-TOKEN' | 'X-CSRF-TOKEN';
    token: string;
};

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

export function jsonRequestHeaders(): HeadersInit {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...csrfHeaders(),
    };
}

export function formRequestHeaders(): HeadersInit {
    return {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...csrfHeaders(),
    };
}
