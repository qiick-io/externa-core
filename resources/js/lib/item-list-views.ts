import { FILTER_META_KEYS } from '@/lib/item-list-filters';
import type { ItemRow } from '@/types';
import type { QueryParams } from '@/wayfinder';

/**
 * Display title for an item card in the calendar and kanban views: the
 * server `displays.title`, else `data.title` (a string, the first non-empty
 * translation, or a number), else `#id`.
 */
export function itemRowTitle(row: ItemRow): string {
    const display = row.displays?.title;

    if (typeof display === 'string' && display.trim() !== '') {
        return display;
    }

    const title = row.data?.title;

    if (typeof title === 'string' && title.trim() !== '') {
        return title;
    }

    if (typeof title === 'number') {
        return String(title);
    }

    if (title && typeof title === 'object' && !Array.isArray(title)) {
        const first = Object.values(title as Record<string, unknown>).find(
            (value) => typeof value === 'string' && value.trim() !== '',
        );

        if (typeof first === 'string') {
            return first;
        }
    }

    return `#${row.id}`;
}

/**
 * Turns the list page's Inertia `filters` into the items JSON query the
 * calendar and kanban views fetch with: field filters under `filter`, plus the
 * trashed / draft / review flags and the sort.
 */
export function buildItemListQuery(
    filters: Record<string, unknown>,
): QueryParams {
    const query: QueryParams = {};
    const filter: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
        if (!FILTER_META_KEYS.has(key)) {
            filter[key] = value;
        }
    }

    if (Object.keys(filter).length > 0) {
        query.filter = filter as QueryParams['filter'];
    }

    if (filters.trashed === true) {
        query.trashed = true;
    }

    if (filters.has_draft === true) {
        query.has_draft = true;
    }

    if (filters.in_review === true) {
        query.in_review = true;
    }

    if (typeof filters.sort === 'string' && filters.sort !== '') {
        query.sort = filters.sort;
    }

    if (filters.direction === 'asc' || filters.direction === 'desc') {
        query.direction = filters.direction;
    }

    return query;
}
