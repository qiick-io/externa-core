/**
 * Half-layout commit helpers for Fields DnD (SortableJS onEnd).
 * Mid-drag is DOM-only — no sticky pointer / live hysteresis APIs here.
 */

export type FieldDropIntent = 'before' | 'after';
export type FieldDropLayoutIntent = 'below-new-row' | 'beside' | 'into-group' | null;

/**
 * @param oldIndex - Index of the dragged field
 * @param overIndex - Index of the drop target field
 * @param intent - Vertical/horizontal before vs after the target
 * @returns insert target index, or null when order is already correct
 */
export function targetIndexForFieldDrop(
    oldIndex: number,
    overIndex: number,
    intent: FieldDropIntent,
): number | null {
    let insertIndex = intent === 'before' ? overIndex : overIndex + 1;

    if (oldIndex < insertIndex) {
        insertIndex -= 1;
    }

    if (oldIndex === insertIndex) {
        return null;
    }

    return insertIndex;
}

/**
 * Half over full/fill (or full over half) is vertical-only: force the half onto
 * its own row so it never pairs into the full's row during packing.
 */
export function shouldForceHalfRowBreakForVerticalDrop(
    activeLayoutWidth: string,
    overLayoutWidth: string,
    layoutIntent: FieldDropLayoutIntent,
): boolean {
    if (layoutIntent !== null) {
        return false;
    }

    const activeIsHalf = activeLayoutWidth === 'half';
    const overIsFullRow =
        overLayoutWidth === 'full' || overLayoutWidth === 'fill';
    const activeIsFullRow =
        activeLayoutWidth === 'full' || activeLayoutWidth === 'fill';
    const overIsHalf = overLayoutWidth === 'half';

    return (activeIsHalf && overIsFullRow) || (activeIsFullRow && overIsHalf);
}

/**
 * Half↔half over a lone half (open partner column).
 * Bottom strip stacks to a new row; right column / left card → beside.
 */
export function halfOpenSlotDropIntent(
    relativeX: number,
    relativeY: number,
): { intent: FieldDropIntent; layoutIntent: 'beside' | 'below-new-row' } {
    if (relativeY > 1.05) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    if (relativeX >= 0.45) {
        return { intent: 'after', layoutIntent: 'beside' };
    }

    if (relativeY > 0.72) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    return { intent: 'before', layoutIntent: 'beside' };
}

/**
 * Half↔half already paired (no open column). One-shot onEnd geometry —
 * Sortable invertSwap owns mid-drag seat swaps.
 */
export function halfPairedDropIntent(
    relativeX: number,
    relativeY: number,
    verticalIntent: FieldDropIntent,
): { intent: FieldDropIntent; layoutIntent: 'below-new-row' | null } {
    if (relativeY > 0.82 && relativeX > 0.12 && relativeX < 0.88) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    return { intent: verticalIntent, layoutIntent: null };
}

/**
 * Half dragged onto an occupied half pair (external — not the live partner).
 *
 * Directus SortableJS + 2-col grid:
 * - Leading card right edge → insert before (active|over, old right wraps)
 * - Leading mid/left → stack below the pair
 * - Trailing mid → insert before (left|active, over wraps)
 * - Trailing far-left → stack below
 */
export function halfOccupiedInsertDropIntent(
    relativeX: number,
    relativeY: number,
    overIsLeading: boolean,
): { intent: FieldDropIntent; layoutIntent: 'beside' | 'below-new-row' } {
    if (relativeY > 0.82 && relativeX > 0.12 && relativeX < 0.88) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    if (overIsLeading) {
        if (relativeX >= 0.55) {
            return { intent: 'before', layoutIntent: 'beside' };
        }

        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    if (relativeX >= 0.4) {
        return { intent: 'before', layoutIntent: 'beside' };
    }

    return { intent: 'after', layoutIntent: 'below-new-row' };
}

/** New leading half id when inserting into an occupied pair (row-break SoT). */
export type OccupiedHalfInsert = {
    newLeadingId: number;
};

/**
 * Stack-below must insert *after* the over field. A row-break on the leading
 * half of a pair is a no-op in packing — break belongs on the trailing field.
 */
export function intentForLayoutDrop(
    intent: FieldDropIntent,
    layoutIntent: FieldDropLayoutIntent,
): FieldDropIntent {
    if (layoutIntent === 'below-new-row') {
        return 'after';
    }

    return intent;
}

/**
 * Row-break ids after a Sortable drop (commit once on end).
 *
 * Always derived from drag-start so a transient beside hover cannot permanently
 * clear unrelated `starts_new_row` flags (stacked halves must stay stacked).
 */
export function rowBreakIdsForDropFrame(
    dragStartIds: readonly number[],
    activeId: number,
    overId: number | null,
    layoutIntent: FieldDropLayoutIntent,
    dropIntent: FieldDropIntent,
    forceHalfRowBreak: boolean,
    livePairedHalves: boolean,
    occupiedInsert: OccupiedHalfInsert | null = null,
): Set<number> {
    const next = new Set(dragStartIds);

    if (layoutIntent === 'beside') {
        next.delete(activeId);

        if (dropIntent === 'before' && overId !== null) {
            next.delete(overId);
        }

        if (occupiedInsert !== null) {
            next.add(occupiedInsert.newLeadingId);
        }

        return next;
    }

    if (layoutIntent === 'below-new-row' || forceHalfRowBreak) {
        next.add(activeId);

        return next;
    }

    if (livePairedHalves && overId !== null) {
        next.delete(activeId);
        next.delete(overId);

        return next;
    }

    return next;
}

type LayoutWidthField = {
    id: number;
    settings?: Record<string, unknown> | null;
};

/**
 * Resolve half/full layout intent from release geometry against `over`.
 * Used once in Sortable onEnd — never mid-drag.
 */
export function resolveHalfDropOnEnd(args: {
    activeWidth: string;
    overWidth: string;
    relativeX: number;
    relativeY: number;
    verticalIntent: FieldDropIntent;
    overHasOpenPartner: boolean;
    overIsLeadingInOccupiedPair: boolean | null;
}): {
    intent: FieldDropIntent;
    layoutIntent: FieldDropLayoutIntent;
    occupiedInsertActiveAsLeading: boolean;
} {
    const {
        activeWidth,
        overWidth,
        relativeX,
        relativeY,
        verticalIntent,
        overHasOpenPartner,
        overIsLeadingInOccupiedPair,
    } = args;

    const activeIsHalf = activeWidth === 'half';
    const overIsHalf = overWidth === 'half';

    if (activeIsHalf && overIsHalf && overIsLeadingInOccupiedPair !== null) {
        const occupied = halfOccupiedInsertDropIntent(
            relativeX,
            relativeY,
            overIsLeadingInOccupiedPair,
        );

        return {
            intent: occupied.intent,
            layoutIntent: occupied.layoutIntent,
            occupiedInsertActiveAsLeading: occupied.layoutIntent === 'beside',
        };
    }

    if (activeIsHalf && overIsHalf && overHasOpenPartner) {
        const open = halfOpenSlotDropIntent(relativeX, relativeY);

        return {
            intent: open.intent,
            layoutIntent: open.layoutIntent,
            occupiedInsertActiveAsLeading: false,
        };
    }

    if (activeIsHalf && overIsHalf) {
        const paired = halfPairedDropIntent(
            relativeX,
            relativeY,
            verticalIntent,
        );

        return {
            intent: paired.intent,
            layoutIntent: paired.layoutIntent,
            occupiedInsertActiveAsLeading: false,
        };
    }

    const forceBreak = shouldForceHalfRowBreakForVerticalDrop(
        activeWidth,
        overWidth,
        null,
    );

    return {
        intent: verticalIntent,
        layoutIntent: forceBreak ? 'below-new-row' : null,
        occupiedInsertActiveAsLeading: false,
    };
}

/**
 * Whether packing through `throughIndex` leaves an open half partner slot.
 */
export function halfPackingAwaitingPartnerThrough(
    fields: LayoutWidthField[],
    throughIndex: number,
    startsNewRow: (field: LayoutWidthField) => boolean,
    layoutWidth: (field: LayoutWidthField) => string,
): boolean {
    let awaitingHalfPartner = false;

    for (let index = 0; index <= throughIndex; index++) {
        const field = fields[index];

        if (field === undefined) {
            continue;
        }

        if (startsNewRow(field)) {
            awaitingHalfPartner = false;
        }

        const width = layoutWidth(field);

        if (width === 'full' || width === 'fill') {
            awaitingHalfPartner = false;
            continue;
        }

        if (width === 'half') {
            awaitingHalfPartner = !awaitingHalfPartner;
            continue;
        }

        awaitingHalfPartner = false;
    }

    return awaitingHalfPartner;
}
