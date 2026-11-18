import { router } from '@inertiajs/react';
import { useCallback, useState } from 'react';
import { useDebouncedServerSearch } from '@/hooks/use-debounced-server-search';
import { serializeFilterRules } from '@/lib/item-list-filters';
import type { FilterRule } from '@/lib/item-list-filters';
import { listPerPageQuery } from '@/lib/pagination';
import collections from '@/routes/collections';
import type { QueryParams } from '@/wayfinder';
import {
    advancedRulesFromFilters,
    rulesWithTitleSearch,
    titleContainsFromFilters,
} from './items-index-helpers';
import type { ItemsFilters, ListLayout } from './items-index-helpers';

type UseItemsListFiltersOptions = {
    collectionId: number;
    filters: ItemsFilters;
    perPage: number;
    listLayout: ListLayout;
    kanbanField: string | null;
    calendarField: string | null;
};

/**
 * Search, filter rules, sort and trash / draft / review toggles of a
 * collection's items page.
 *
 * `visit` rebuilds the whole query on the Wayfinder URL and keeps the board or
 * calendar layout across visits; the title search box is debounced and mirrored
 * into a title/_contains rule. New server filters replace the local ones during
 * render.
 */
export function useItemsListFilters({
    collectionId,
    filters,
    perPage: itemsPerPage,
    listLayout,
    kanbanField,
    calendarField,
}: UseItemsListFiltersOptions) {
    const isTrashed = filters.trashed === true;
    const hasDraftFilter = filters.has_draft === true;
    const inReviewFilter = filters.in_review === true;
    const [filterTitle, setFilterTitle] = useState(() =>
        titleContainsFromFilters(filters),
    );
    const [filterRules, setFilterRules] = useState<FilterRule[]>(() =>
        advancedRulesFromFilters(filters),
    );
    const [previousFilters, setPreviousFilters] = useState(filters);

    // Adopt new server filters during render (React's "adjust state on prop
    // change" pattern); local edits survive until then.
    if (previousFilters !== filters) {
        setPreviousFilters(filters);
        setFilterTitle(titleContainsFromFilters(filters));
        setFilterRules(advancedRulesFromFilters(filters));
    }

    const visit = useCallback(
        (
            overrides: {
                title?: string;
                rules?: FilterRule[];
                sort?: string;
                direction?: 'asc' | 'desc';
                trashed?: boolean;
                has_draft?: boolean;
                in_review?: boolean;
            } = {},
        ) => {
            const nextRules =
                overrides.rules ??
                (overrides.title !== undefined
                    ? rulesWithTitleSearch(filterRules, overrides.title)
                    : filterRules);
            const nextSort = overrides.sort ?? filters.sort ?? 'id';
            const nextDirection =
                overrides.direction ??
                (filters.direction === 'asc' ? 'asc' : 'desc');
            const nextTrashed =
                overrides.trashed !== undefined ? overrides.trashed : isTrashed;
            const nextHasDraft =
                overrides.has_draft !== undefined
                    ? overrides.has_draft
                    : hasDraftFilter;
            const nextInReview =
                overrides.in_review !== undefined
                    ? overrides.in_review
                    : inReviewFilter;

            const filterPayload = serializeFilterRules(nextRules);

            // ponytail: put query on the Wayfinder URL (not router data) so cleared
            // filters are dropped instead of merged into the current search string.
            const query: QueryParams = {
                sort: nextSort,
                direction: nextDirection,
            };

            if (Object.keys(filterPayload).length > 0) {
                query.filter = filterPayload;
            }

            if (nextTrashed) {
                query.trashed = true;
            }

            if (nextHasDraft) {
                query.has_draft = true;
            }

            if (nextInReview) {
                query.in_review = true;
            }

            // Keep board/calendar across search/filter visits (prefs alone lag URL).
            if (listLayout === 'kanban' || listLayout === 'calendar') {
                query.layout = listLayout;
            }

            if (listLayout === 'kanban' && kanbanField) {
                query.kanban_field = kanbanField;
            }

            if (listLayout === 'calendar' && calendarField) {
                query.calendar_field = calendarField;
            }

            const perPage = listPerPageQuery(itemsPerPage);

            if (perPage !== undefined) {
                query.per_page = perPage;
            }

            router.get(
                collections.items.index.url(collectionId, { query }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [
            calendarField,
            collectionId,
            filterRules,
            filters.direction,
            filters.sort,
            hasDraftFilter,
            inReviewFilter,
            isTrashed,
            itemsPerPage,
            kanbanField,
            listLayout,
        ],
    );

    const onDebouncedTitleSearch = useCallback(
        (value: string): void => {
            setFilterRules((current) => {
                const nextRules = rulesWithTitleSearch(current, value);
                visit({ rules: nextRules });

                return nextRules;
            });
        },
        [visit],
    );

    useDebouncedServerSearch(
        filterTitle,
        titleContainsFromFilters(filters),
        onDebouncedTitleSearch,
    );

    const clearFilters = useCallback(() => {
        setFilterTitle('');
        setFilterRules([]);
        visit({ rules: [], has_draft: false, in_review: false });
    }, [visit]);

    const applyFilterRules = useCallback(() => {
        const titleContains = filterRules.find(
            (rule) => rule.field === 'title' && rule.operator === '_contains',
        );
        setFilterTitle(titleContains?.value ?? '');
        visit({ rules: filterRules });
    }, [filterRules, visit]);

    return {
        filterTitle,
        setFilterTitle,
        filterRules,
        setFilterRules,
        visit,
        clearFilters,
        applyFilterRules,
    };
}
