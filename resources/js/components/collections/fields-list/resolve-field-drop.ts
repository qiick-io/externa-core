import {
    clientPointFromEvent,
    fieldsWithRowBreakOverrides,
    parentGroupFromList,
    resolveDropRelated,
    sortableItemFromEvent,
} from '@/components/collections/fields-list/field-list-layout';
import type { SortableEndEvent } from '@/components/collections/fields-list/field-list-layout';
import {
    halfPackingAwaitingPartnerThrough,
    intentForLayoutDrop,
    resolveHalfDropOnEnd,
    rowBreakIdsForDropFrame,
} from '@/lib/collection-field-drop';
import type { OccupiedHalfInsert } from '@/lib/collection-field-drop';
import {
    getFieldGroupName,
    isLayoutGroupType,
} from '@/lib/collection-field-groups';
import {
    fieldStartsNewLayoutRow,
    getFieldLayoutWidth,
} from '@/lib/collection-field-types';
import type { CollectionFieldRow } from '@/types';

/** Field order, row breaks and group membership captured when a drag starts. */
export type FieldDragStart = {
    orderIds: number[];
    rowBreakIds: number[];
    groups: Map<number, string | null>;
};

/** Last Sortable onMove target and pointer position (onEnd omits `related`). */
export type FieldDragLastMove = {
    related: HTMLElement | null;
    clientX: number;
    clientY: number;
};

type ResolveFieldDropOptions = {
    evt: SortableEndEvent;
    rootList: HTMLElement;
    groups: Map<number, string | null>;
    /** DOM order read after the drop; reordered in place for half/half seats. */
    nextFields: CollectionFieldRow[];
    byId: Map<number, CollectionFieldRow>;
    start: FieldDragStart;
    move: FieldDragLastMove | null;
};

/**
 * Resolve the row breaks (and the half-width seat order) of a field drop.
 *
 * CSS-grid Sortable often won't invert or move DOM seats, so the paired swap,
 * stack-below and beside insert are applied to `nextFields` in place here.
 * Returns null when the pointer left the board: the caller then restores the
 * pre-drag order and commits nothing.
 */
export function resolveFieldDropCommit({
    evt,
    rootList,
    groups,
    nextFields,
    byId,
    start,
    move,
}: ResolveFieldDropOptions): Set<number> | null {
    const activeItem = sortableItemFromEvent(evt);
    const activeId = activeItem ? Number(activeItem.dataset.sortableId) : NaN;
    let nextBreaks = new Set(start.rowBreakIds);

    if (Number.isFinite(activeId) && activeItem) {
        const original = evt.originalEvent as
            | MouseEvent
            | TouchEvent
            | undefined;
        const endPoint = clientPointFromEvent(original);
        const clientX = endPoint.clientX || move?.clientX || 0;
        const clientY = endPoint.clientY || move?.clientY || 0;
        // Prefer live pointer; fallback ghost is pointer-events:none so
        // elementFromPoint sees what's under the cursor (often chrome).
        const under = document.elementFromPoint(clientX, clientY);
        const pointerOnBoard = Boolean(under?.closest?.('[data-fields-dnd]'));

        // Off-board drop: Sortable may already have inverted paired seats
        // in the DOM — never persist that mid-drag order.
        if (!pointerOnBoard) {
            return null;
        }

        const related = resolveDropRelated(
            activeItem,
            (evt.related instanceof HTMLElement ? evt.related : null) ??
                move?.related ??
                null,
            clientX,
            clientY,
        );
        const overId = related?.dataset.sortableId
            ? Number(related.dataset.sortableId)
            : null;
        const activeField = byId.get(activeId) ?? null;
        const overField = overId !== null ? (byId.get(overId) ?? null) : null;

        if (activeField && overField && related && overId !== null) {
            const rect = related.getBoundingClientRect();
            const relativeX =
                rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
            const relativeY =
                rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
            const verticalIntent =
                relativeY < 0.5 ? ('before' as const) : ('after' as const);

            const parentName =
                groups.get(activeId) ??
                parentGroupFromList(
                    evt.to instanceof HTMLElement ? evt.to : rootList,
                );
            const siblings = nextFields.filter(
                (field) =>
                    (groups.get(field.id) ?? getFieldGroupName(field)) ===
                    parentName,
            );
            const siblingsForPack = fieldsWithRowBreakOverrides(
                siblings.map((field) => {
                    if (!isLayoutGroupType(field.type)) {
                        return field;
                    }

                    return {
                        ...field,
                        settings: {
                            ...field.settings,
                            layout_width: 'full',
                        },
                    };
                }),
                nextBreaks,
            );
            const overIndex = siblingsForPack.findIndex(
                (field) => field.id === overId,
            );
            const overHasOpenPartner =
                overIndex !== -1 &&
                getFieldLayoutWidth(siblingsForPack[overIndex]?.settings) ===
                    'half' &&
                halfPackingAwaitingPartnerThrough(
                    siblingsForPack,
                    overIndex,
                    (field) => fieldStartsNewLayoutRow(field.settings),
                    (field) => getFieldLayoutWidth(field.settings),
                );

            let overIsLeadingInOccupiedPair: boolean | null = null;

            if (
                overIndex !== -1 &&
                getFieldLayoutWidth(activeField.settings) === 'half' &&
                getFieldLayoutWidth(overField.settings) === 'half' &&
                !overHasOpenPartner
            ) {
                const awaitingBefore =
                    overIndex > 0 &&
                    halfPackingAwaitingPartnerThrough(
                        siblingsForPack,
                        overIndex - 1,
                        (field) => fieldStartsNewLayoutRow(field.settings),
                        (field) => getFieldLayoutWidth(field.settings),
                    );
                // Leading = opened the half row; trailing = closed it.
                const overIsLeading = !awaitingBefore;
                const partnerIndex = overIsLeading
                    ? overIndex + 1
                    : overIndex - 1;
                const partner = siblingsForPack[partnerIndex];
                const partnerIsHalf =
                    partner !== undefined &&
                    getFieldLayoutWidth(partner.settings) === 'half';

                if (partnerIsHalf && partner.id !== activeId) {
                    overIsLeadingInOccupiedPair = overIsLeading;
                }
            }

            const resolved = resolveHalfDropOnEnd({
                activeWidth: getFieldLayoutWidth(activeField.settings),
                overWidth: getFieldLayoutWidth(overField.settings),
                relativeX,
                relativeY,
                verticalIntent,
                overHasOpenPartner,
                overIsLeadingInOccupiedPair,
            });

            const dropIntent = intentForLayoutDrop(
                resolved.intent,
                resolved.layoutIntent,
            );
            let occupiedInsert: OccupiedHalfInsert | null = null;

            if (
                resolved.occupiedInsertActiveAsLeading &&
                resolved.layoutIntent === 'beside'
            ) {
                // Leading over: active becomes new leading (B|C, D wraps).
                // Trailing over: pair's left stays leading (C|B, D wraps).
                let newLeadingId = activeId;

                if (overIsLeadingInOccupiedPair === false) {
                    const pairLeading = siblingsForPack[overIndex - 1];
                    newLeadingId =
                        pairLeading !== undefined ? pairLeading.id : overId;
                } else if (dropIntent !== 'before') {
                    newLeadingId = overId;
                }

                occupiedInsert = { newLeadingId };
            }

            const livePairedHalves =
                getFieldLayoutWidth(activeField.settings) === 'half' &&
                getFieldLayoutWidth(overField.settings) === 'half' &&
                !overHasOpenPartner &&
                overIsLeadingInOccupiedPair === null &&
                resolved.layoutIntent === null;

            nextBreaks = rowBreakIdsForDropFrame(
                start.rowBreakIds,
                activeId,
                overId,
                resolved.layoutIntent,
                dropIntent,
                false,
                livePairedHalves,
                occupiedInsert,
            );

            // CSS-grid Sortable often won't invert/move DOM seats — apply
            // paired swap / stack-below / beside insert in the commit list.
            if (overId !== null) {
                const activeIdx = nextFields.findIndex(
                    (field) => field.id === activeId,
                );
                const overIdx = nextFields.findIndex(
                    (field) => field.id === overId,
                );

                if (activeIdx !== -1 && overIdx !== -1) {
                    if (resolved.layoutIntent === 'beside') {
                        const active = nextFields[activeIdx]!;
                        const without = nextFields.filter(
                            (field) => field.id !== activeId,
                        );
                        const overAt = without.findIndex(
                            (field) => field.id === overId,
                        );
                        const insertAt =
                            dropIntent === 'before' ? overAt : overAt + 1;
                        without.splice(Math.max(0, insertAt), 0, active);
                        nextFields.length = 0;
                        nextFields.push(...without);
                    } else if (
                        livePairedHalves &&
                        resolved.layoutIntent === null &&
                        Math.abs(activeIdx - overIdx) === 1
                    ) {
                        const swapped = [...nextFields];
                        const tmp = swapped[activeIdx]!;
                        swapped[activeIdx] = swapped[overIdx]!;
                        swapped[overIdx] = tmp;
                        nextFields.length = 0;
                        nextFields.push(...swapped);
                    } else if (
                        resolved.layoutIntent === 'below-new-row' &&
                        getFieldLayoutWidth(activeField.settings) === 'half' &&
                        getFieldLayoutWidth(overField.settings) === 'half'
                    ) {
                        const active = nextFields[activeIdx]!;
                        const without = nextFields.filter(
                            (field) => field.id !== activeId,
                        );
                        const insertAt =
                            without.findIndex((field) => field.id === overId) +
                            1;
                        without.splice(insertAt, 0, active);
                        nextFields.length = 0;
                        nextFields.push(...without);
                        nextBreaks.add(activeId);
                    }
                }
            }
        } else if (
            activeField &&
            getFieldLayoutWidth(activeField.settings) === 'half'
        ) {
            // Dropped into empty nest / no related — keep start breaks.
            nextBreaks = new Set(start.rowBreakIds);
        }
    }

    return nextBreaks;
}
