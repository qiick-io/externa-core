import type { Paginated } from '@/types/admin';

/** Laravel paginator JSON shape before normalization (meta wrapper or flat keys). */
export type LaravelPaginated<T> = {
    data: T[];
    meta?: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        links?: Paginated<T>['links'];
    };
    links?: Paginated<T>['links'];
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
};

/**
 * Normalizes Laravel paginator responses into the flat `Paginated<T>` shape used by the UI.
 *
 * @param payload - Raw paginator JSON from the API
 * @returns Normalized pagination object
 */
export function normalizePaginated<T>(
    payload: LaravelPaginated<T> | Paginated<T>,
): Paginated<T> {
    if ('meta' in payload && payload.meta) {
        return {
            data: payload.data,
            current_page: payload.meta.current_page,
            last_page: payload.meta.last_page,
            per_page: payload.meta.per_page,
            total: payload.meta.total,
            links: payload.meta.links ?? payload.links,
        };
    }

    return payload as Paginated<T>;
}

/** "Rows per page" choices for admin lists (antd set; mirrors ValidatesListPerPageTrait). */
export const LIST_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;

/** Server default page size when `per_page` is absent or unsupported. */
export const DEFAULT_LIST_PER_PAGE = 20;

/**
 * `per_page` query value to keep when a list rebuilds its URL (search, sort,
 * filters): the current size, or `undefined` for the default so URLs stay clean.
 *
 * @param perPage - Current page size from the paginator props
 * @returns Value for the `per_page` query param
 */
export function listPerPageQuery(
    perPage: number | undefined,
): number | undefined {
    return perPage && perPage !== DEFAULT_LIST_PER_PAGE ? perPage : undefined;
}

/**
 * Current URL with a new `per_page` (dropped when default) and `page` reset to 1.
 * Every other query param (search, sort, filters, trashed) is kept.
 *
 * @param currentUrl - Absolute or relative URL of the list page
 * @param perPage - Selected page size
 * @returns Relative URL (path + query) to visit
 */
export function listUrlWithPerPage(
    currentUrl: string,
    perPage: number,
): string {
    const url = new URL(currentUrl, window.location.origin);
    url.searchParams.delete('page');

    if (perPage === DEFAULT_LIST_PER_PAGE) {
        url.searchParams.delete('per_page');
    } else {
        url.searchParams.set('per_page', String(perPage));
    }

    return `${url.pathname}${url.search}`;
}
