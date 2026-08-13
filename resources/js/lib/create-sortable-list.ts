import Sortable from 'sortablejs';
import type { Options } from 'sortablejs';

/** Directus-ish defaults for flat lists (Fields may override further). */
export const SORTABLE_LIST_DEFAULTS: Options = {
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
};

/**
 * Thin SortableJS factory — not a framework. Caller owns destroy() in useEffect cleanup.
 */
export function createSortableList(
    el: HTMLElement,
    options: Options = {},
): Sortable {
    return Sortable.create(el, {
        ...SORTABLE_LIST_DEFAULTS,
        ...options,
    });
}
