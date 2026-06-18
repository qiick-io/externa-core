import type { Paginated } from '@/types/admin';

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
