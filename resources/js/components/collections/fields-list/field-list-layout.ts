import type { SortableEvent } from 'sortablejs';
import {
    getFieldGroupName,
    isLayoutGroupType,
} from '@/lib/collection-field-groups';
import type { FieldTreeNode } from '@/lib/collection-field-groups';
import {
    fieldStartsNewLayoutRow,
    groupFieldsIntoLayoutRows,
} from '@/lib/collection-field-types';
import type { CollectionFieldRow } from '@/types';

/*
 * Pure layout and DOM helpers of the collection fields board: row-break and
 * group maps, half/full row packing of tree nodes, and the Sortable DOM reads
 * and restores the drag-and-drop commit relies on.
 */

export function findOverflowScrollParent(
    start: Element | null,
): HTMLElement | null {
    let node: Element | null = start;

    while (node instanceof HTMLElement) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;

        if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight
        ) {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

export function rowBreakFieldIdsFromFields(
    fields: CollectionFieldRow[],
): Set<number> {
    return new Set(
        fields
            .filter((field) => fieldStartsNewLayoutRow(field.settings))
            .map((field) => field.id),
    );
}

export function fieldsWithRowBreakOverrides(
    fields: CollectionFieldRow[],
    rowBreakFieldIds: Set<number>,
): CollectionFieldRow[] {
    return fields.map((field) => {
        const shouldStartNewRow = rowBreakFieldIds.has(field.id);
        const currentlyStarts = fieldStartsNewLayoutRow(field.settings);

        if (shouldStartNewRow === currentlyStarts) {
            return field;
        }

        return {
            ...field,
            settings: {
                ...field.settings,
                layout_starts_new_row: shouldStartNewRow,
            },
        };
    });
}

export function groupsMapFromFields(
    fields: CollectionFieldRow[],
): Map<number, string | null> {
    const map = new Map<number, string | null>();

    for (const field of fields) {
        map.set(field.id, getFieldGroupName(field));
    }

    return map;
}

/**
 * Pack sibling tree nodes into half/full layout rows.
 * Layout groups always span a full row so nest containers stay full width.
 */
export function groupTreeNodesIntoLayoutRows(
    nodes: FieldTreeNode<CollectionFieldRow>[],
    rowBreakFieldIds: Set<number> = new Set(),
): {
    node: FieldTreeNode<CollectionFieldRow>;
    colSpan: 1 | 2;
    startsNewRow: boolean;
}[] {
    const fieldsForLayout = fieldsWithRowBreakOverrides(
        nodes.map((node) => {
            if (!isLayoutGroupType(node.field.type)) {
                return node.field;
            }

            return {
                ...node.field,
                settings: {
                    ...node.field.settings,
                    layout_width: 'full',
                },
            };
        }),
        rowBreakFieldIds,
    );

    const byId = new Map(nodes.map((node) => [node.field.id, node]));
    const flat: {
        node: FieldTreeNode<CollectionFieldRow>;
        colSpan: 1 | 2;
        startsNewRow: boolean;
    }[] = [];

    for (const row of groupFieldsIntoLayoutRows(fieldsForLayout)) {
        for (const { field, colSpan } of row) {
            const node = byId.get(field.id);

            if (node) {
                flat.push({
                    node,
                    colSpan,
                    startsNewRow: rowBreakFieldIds.has(node.field.id),
                });
            }
        }
    }

    return flat;
}

/** DFS ids + parent map from Sortable DOM (post-drop SoT). */
export function readDomFieldOrder(rootList: HTMLElement): {
    ids: number[];
    groups: Map<number, string | null>;
} {
    const ids: number[] = [];
    const groups = new Map<number, string | null>();

    const walk = (list: HTMLElement, parentName: string | null): void => {
        for (const child of Array.from(list.children)) {
            if (!(child instanceof HTMLElement)) {
                continue;
            }

            const idAttr = child.dataset.sortableId;

            if (!idAttr) {
                continue;
            }

            const id = Number(idAttr);

            if (!Number.isFinite(id)) {
                continue;
            }

            ids.push(id);
            groups.set(id, parentName);

            const nested = child.querySelector(':scope > [data-field-list]');

            if (nested instanceof HTMLElement) {
                const fieldName = child.dataset.fieldName ?? null;
                walk(nested, fieldName);
            }
        }
    };

    walk(rootList, null);

    return { ids, groups };
}

/**
 * Put Sortable-moved nodes back under the pre-drag lists/order so React can
 * reconcile without removeChild NotFoundError, then setState to the new tree.
 */
export function restoreFieldDomToStart(
    rootList: HTMLElement,
    orderIds: readonly number[],
    groups: Map<number, string | null>,
): void {
    const items = new Map<number, HTMLElement>();

    for (const el of rootList.querySelectorAll(':scope [data-sortable-id]')) {
        if (!(el instanceof HTMLElement)) {
            continue;
        }

        // Only capture nodes that are direct children of a field list
        // (skip nested matches that are descendants of another sortable item
        // once the parent is already captured — querySelectorAll is fine if we
        // detach leaves-first... detach all list children instead.)
    }

    for (const list of rootList.querySelectorAll('[data-field-list]')) {
        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (!(child instanceof HTMLElement) || !child.dataset.sortableId) {
                continue;
            }

            const id = Number(child.dataset.sortableId);

            if (Number.isFinite(id)) {
                items.set(id, child);
            }
        }
    }

    for (const list of rootList.querySelectorAll('[data-field-list]')) {
        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (child instanceof HTMLElement && child.dataset.sortableId) {
                child.remove();
            }
        }
    }

    const listForParent = (parentName: string | null): HTMLElement | null => {
        if (parentName === null || parentName === '') {
            return rootList;
        }

        return (
            rootList.querySelector(
                `[data-field-list][data-group-parent="${CSS.escape(parentName)}"]`,
            ) ?? null
        );
    };

    for (const id of orderIds) {
        const el = items.get(id);

        if (!el) {
            continue;
        }

        const parentName = groups.get(id) ?? null;
        const list = listForParent(parentName);

        if (list) {
            list.appendChild(el);
        }
    }
}

/** Sortable onEnd carries related + originalEvent at runtime; @types omits them. */
export type SortableEndEvent = SortableEvent & {
    related?: HTMLElement | null;
    originalEvent?: Event;
};

export function sortableItemFromEvent(evt: SortableEvent): HTMLElement | null {
    const item = evt.item;

    return item instanceof HTMLElement ? item : null;
}

export function parentGroupFromList(list: HTMLElement): string | null {
    const raw = list.dataset.groupParent;

    if (raw === undefined || raw === '') {
        return null;
    }

    return raw;
}

export function clientPointFromEvent(event: Event | undefined): {
    clientX: number;
    clientY: number;
} {
    if (!event) {
        return { clientX: 0, clientY: 0 };
    }

    if ('clientX' in event && typeof event.clientX === 'number') {
        const clientY =
            'clientY' in event && typeof event.clientY === 'number'
                ? event.clientY
                : 0;

        return { clientX: event.clientX, clientY };
    }

    if ('changedTouches' in event) {
        const touch = (event as TouchEvent).changedTouches[0];

        if (touch) {
            return { clientX: touch.clientX, clientY: touch.clientY };
        }
    }

    return { clientX: 0, clientY: 0 };
}

/** Prefer MoveEvent.related; else nearest DOM sibling under the pointer. */
export function resolveDropRelated(
    activeItem: HTMLElement,
    related: HTMLElement | null,
    clientX: number,
    clientY: number,
): HTMLElement | null {
    // Prefer the card under the pointer (Sortable related often lags / wrong on grid).
    const under = document.elementFromPoint(clientX, clientY);
    const underItem = under?.closest?.(
        '[data-sortable-id]',
    ) as HTMLElement | null;

    if (
        underItem?.dataset.sortableId &&
        underItem !== activeItem &&
        !activeItem.contains(underItem)
    ) {
        return underItem;
    }

    if (related?.dataset.sortableId && related !== activeItem) {
        return related;
    }

    const prev = activeItem.previousElementSibling;
    const next = activeItem.nextElementSibling;
    const candidates = [prev, next].filter(
        (el): el is HTMLElement =>
            el instanceof HTMLElement && Boolean(el.dataset.sortableId),
    );

    if (candidates.length === 0) {
        return null;
    }

    if (candidates.length === 1) {
        return candidates[0] ?? null;
    }

    let best: HTMLElement | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = (cx - clientX) ** 2 + (cy - clientY) ** 2;

        if (dist < bestDist) {
            bestDist = dist;
            best = el;
        }
    }

    return best;
}
