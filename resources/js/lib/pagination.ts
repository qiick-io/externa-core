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
