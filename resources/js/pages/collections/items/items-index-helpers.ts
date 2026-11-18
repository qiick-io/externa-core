import ItemListController from '@/actions/App/Http/Controllers/Collections/ItemListController';
import {
    emptyFilterRule,
    FILTER_META_KEYS,
    parseFiltersFromProps,
    serializeFilterRules,
} from '@/lib/item-list-filters';
import type { FilterRule } from '@/lib/item-list-filters';
import type { ItemRow } from '@/types';

/*
 * Types and pure helpers of the collection items list page: the filter props
 * from the server, the title quick-search ↔ title/_contains rule mirror, the
 * item label used in confirms and AI prompts, and the export URL.
 */

export type ListLayout = 'table' | 'kanban' | 'calendar';

export type Paginator<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
};

export type ItemsFilters = Record<string, unknown> & {
    sort?: string;
    direction?: string;
    trashed?: boolean;
    has_draft?: boolean;
    in_review?: boolean;
};

export function titleContainsFromFilters(filters: ItemsFilters): string {
    const title = filters.title;

    if (typeof title === 'string') {
        return title;
    }

    if (title && typeof title === 'object' && !Array.isArray(title)) {
        const ops = title as Record<string, unknown>;

        if (typeof ops._contains === 'string') {
            return ops._contains;
        }
    }

    return '';
}

export function itemLabel(row: ItemRow): string | null {
    const display = row.displays?.title;

    if (typeof display === 'string' && display.trim() !== '') {
        return display;
    }

    const title = row.data?.title;

    if (typeof title === 'string' && title.trim() !== '') {
        return title;
    }

    if (title && typeof title === 'object' && !Array.isArray(title)) {
        const first = Object.values(title as Record<string, unknown>).find(
            (value) => typeof value === 'string' && value.trim() !== '',
        );

        if (typeof first === 'string') {
            return first;
        }
    }

    return null;
}

/**
 * Hydrate advanced filter builder from URL/Inertia filters.
 * Title quick-search is mirrored into a title/_contains rule so the builder
 * can edit/clear the same filter the search box shows.
 */
export function advancedRulesFromFilters(filters: ItemsFilters): FilterRule[] {
    const fieldFilters: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
        if (FILTER_META_KEYS.has(key)) {
            continue;
        }

        fieldFilters[key] = value;
    }

    return parseFiltersFromProps(fieldFilters);
}

/** Keep search box and title/_contains rule in sync before navigating. */
export function rulesWithTitleSearch(
    rules: FilterRule[],
    title: string,
): FilterRule[] {
    const withoutTitleContains = rules.filter(
        (rule) => !(rule.field === 'title' && rule.operator === '_contains'),
    );
    const trimmed = title.trim();

    if (trimmed === '') {
        return withoutTitleContains;
    }

    return [
        ...withoutTitleContains,
        { ...emptyFilterRule('title'), operator: '_contains', value: trimmed },
    ];
}

/**
 * CSV / JSON export URL for the current sort, filter rules and title search.
 * The search box is folded into title/_contains unless a title equality rule
 * already narrows the export.
 */
export function itemsExportUrl(
    collectionId: number,
    format: 'csv' | 'json',
    filterRules: FilterRule[],
    filterTitle: string,
    filters: ItemsFilters,
): string {
    const filterPayload = serializeFilterRules(filterRules);
    const trimmedTitle = filterTitle.trim();

    if (trimmedTitle !== '') {
        const titleBag = filterPayload.title ?? {};

        if (
            !('_eq' in titleBag) &&
            !('_neq' in titleBag) &&
            !('_in' in titleBag)
        ) {
            filterPayload.title = {
                ...titleBag,
                _contains: trimmedTitle,
            };
        }
    }

    const params = new URLSearchParams();
    params.set('format', format);
    params.set('sort', filters.sort ?? 'id');
    params.set('direction', filters.direction === 'asc' ? 'asc' : 'desc');

    for (const [field, ops] of Object.entries(filterPayload)) {
        if (ops && typeof ops === 'object') {
            for (const [op, value] of Object.entries(ops)) {
                if (value === undefined || value === null) {
                    continue;
                }

                params.set(
                    `filter[${field}][${op}]`,
                    Array.isArray(value) ? value.join(',') : String(value),
                );
            }
        }
    }

    return `${ItemListController.exportMethod.url(collectionId)}?${params.toString()}`;
}
