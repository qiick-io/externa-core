/**
 * Flat-list insert index for field DnD (before/after + beside / new-row).
 * Never use raw arrayMove(old, over) for vertical half↔full — that swaps into
 * the over slot and packs a half beside a full in the 2-col grid.
 */

export type FieldDropIntent = 'before' | 'after';
export type FieldDropLayoutIntent = 'below-new-row' | 'beside' | 'into-group' | null;

/**
 * @param oldIndex - Index of the dragged field
 * @param overIndex - Index of the drop target field
 * @param intent - Vertical/horizontal before vs after the target
 * @returns arrayMove target index, or null when order is already correct
 */
export function targetIndexForFieldDrop(
    oldIndex: number,
    overIndex: number,
    intent: FieldDropIntent,
): number | null {
    // before → insert at over; after / beside-right / below → insert after over.
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
 * its own row so it never pairs into the full's row during live preview.
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
 * Bottom strip stacks to a new row (checked first — right+bottom must not
 * stick as beside). Right column / left card → beside.
 */
export function halfOpenSlotDropIntent(
    relativeX: number,
    relativeY: number,
): { intent: FieldDropIntent; layoutIntent: 'beside' | 'below-new-row' } {
    // Past the bottom edge of the row → stack. Right/empty column otherwise
    // stays beside (approaching the partner slot from below must not stack).
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
 * Half↔half already paired (no open column).
 *
 * Same-row swap with invert-swap hysteresis keyed off drag-start order:
 * - Still at start: swap toward the pointer (L→R / R→L).
 * - Already swapped live: stick unless pointer clearly wants the reverse.
 * Without the stick, R→L undoes every frame (activeIsBeforeOver flips → after).
 *
 * @param startedBeforeOver - active was before over at drag start (null = unknown)
 */
export function halfPairedDropIntent(
    relativeX: number,
    relativeY: number,
    verticalIntent: FieldDropIntent,
    activeIsBeforeOver: boolean | null = null,
    startedBeforeOver: boolean | null = null,
): { intent: FieldDropIntent; layoutIntent: 'below-new-row' | null } {
    // Deep bottom band → stack below (not same-row swap).
    if (relativeY > 0.82 && relativeX > 0.12 && relativeX < 0.88) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    if (activeIsBeforeOver === null) {
        return { intent: verticalIntent, layoutIntent: null };
    }

    const alreadySwapped =
        startedBeforeOver !== null &&
        activeIsBeforeOver !== startedBeforeOver;

    if (alreadySwapped) {
        // Stick at live order unless pointer clearly wants the reverse.
        if (activeIsBeforeOver) {
            if (relativeX > 0.55) {
                return { intent: 'after', layoutIntent: null };
            }

            return { intent: 'before', layoutIntent: null };
        }

        if (relativeX < 0.45) {
            return { intent: 'before', layoutIntent: null };
        }

        return { intent: 'after', layoutIntent: null };
    }

    // Still at drag-start order: move toward the side the pointer is on.
    if (activeIsBeforeOver) {
        // L→R: partner card is a swap zone (any X except unwrap).
        return { intent: 'after', layoutIntent: null };
    }

    // R→L: leading half of partner swaps before.
    if (relativeX < 0.55) {
        return { intent: 'before', layoutIntent: null };
    }

    return { intent: 'after', layoutIntent: null };
}

/**
 * Half dragged onto an occupied half pair (external — not the live partner).
 *
 * Directus SortableJS + 2-col grid:
 * - Leading (left) card: right edge inserts *before* → active|over, old right wraps.
 * - Leading mid/left: stack below the pair.
 * - Trailing (right) card: mid inserts *before* → left|active, over wraps.
 * - Trailing far-left edge: stack below.
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
 * Row-break ids for the current drop frame.
 *
 * Always derived from drag-start so a transient beside hover cannot permanently
 * clear unrelated `starts_new_row` flags (stacked halves must stay stacked).
 *
 * Beside-after (empty partner / trailing): clear only active — keep over's break
 * so a half stacked under another half does not pack with the one above.
 * Beside-before (active becomes leading): also clear over, else over's break
 * would split the new pair.
 *
 * Occupied-pair insert: force a break on the *new* leading half so a prior open
 * half above cannot absorb the insert (Cat alone + Notes|abvl → Topics|Notes
 * must not become Cat|Topics).
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

export type StickyBesideState = {
    activeId: number;
    overId: number;
    /** Preserved for occupied-pair insert (before ≠ open-partner after). */
    intent?: FieldDropIntent;
    occupiedInsert?: OccupiedHalfInsert | null;
};

type RectBox = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};

/**
 * Empty partner column, or a synthetic right-of-over column once packing
 * clears the empty-slot DOM (active fills the beside seat).
 */
export function halfPartnerZoneRect(
    overRect: { left: number; right?: number; width: number; top: number; bottom: number } | null,
    emptyPartnerRect: RectBox | null,
): RectBox | null {
    if (emptyPartnerRect !== null) {
        return emptyPartnerRect;
    }

    if (overRect === null) {
        return null;
    }

    const overRight = overRect.right ?? overRect.left + overRect.width;

    return {
        left: overRight,
        right: overRight + overRect.width,
        top: overRect.top,
        bottom: overRect.bottom,
    };
}

/**
 * Pointer over an open half's empty column → beside (Directus partner slot).
 */
export function openPartnerBesideFromPointer(
    pointer: { x: number; y: number } | null,
    emptyPartnerRect: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    } | null,
    overRect: {
        left: number;
        width: number;
        top?: number;
        bottom?: number;
        right?: number;
    } | null,
    overHasOpenPartner: boolean,
): boolean {
    if (pointer === null || emptyPartnerRect === null) {
        return false;
    }

    // Past the empty row bottom → stack-below, never open-partner beside.
    // Match sticky stack-exit (+6): yr≈1.05 on the card must not re-grab beside
    // after a one-frame unpair opens the partner column under the cursor.
    if (pointer.y > emptyPartnerRect.bottom) {
        return false;
    }

    const inEmpty =
        pointer.x >= emptyPartnerRect.left - 8 &&
        pointer.x <= emptyPartnerRect.right + 8 &&
        pointer.y >= emptyPartnerRect.top - 8 &&
        pointer.y <= emptyPartnerRect.bottom;

    if (inEmpty) {
        return true;
    }

    if (!overHasOpenPartner || overRect === null) {
        return false;
    }

    return (
        pointer.x >= overRect.left + overRect.width * 0.45 &&
        pointer.y >= emptyPartnerRect.top - 8 &&
        pointer.y <= emptyPartnerRect.bottom
    );
}

/**
 * Sticky beside hysteresis: once entered, stay while the pointer remains in
 * the partner column (real empty slot or synthetic after packing). Exit only
 * when clearly off that zone (left of mid / past bottom for stack-below).
 */
export function pointerInStickyBesideZone(
    pointer: { x: number; y: number } | null,
    overRect: {
        left: number;
        width: number;
        top: number;
        bottom: number;
        right?: number;
    } | null,
    emptyPartnerRect: RectBox | null,
): boolean {
    if (pointer === null || overRect === null) {
        return false;
    }

    const zone = halfPartnerZoneRect(overRect, emptyPartnerRect);

    if (zone === null) {
        return false;
    }

    // Wider than enter hit — packing shifts rects under the cursor every frame.
    const padX = 28;
    const padY = 24;
    const inZone =
        pointer.x >= zone.left - padX &&
        pointer.x <= zone.right + padX &&
        pointer.y >= zone.top - padY &&
        pointer.y <= zone.bottom + padY;

    if (inZone) {
        return true;
    }

    // Same-row right half of the over sortable (full-row open wrapper).
    const overRight = overRect.right ?? overRect.left + overRect.width;
    const rowBottom = Math.max(overRect.bottom, zone.bottom);

    return (
        pointer.x >= overRect.left + overRect.width * 0.38 &&
        pointer.x <= overRight + overRect.width + padX &&
        pointer.y >= overRect.top - padY &&
        pointer.y <= rowBottom + padY
    );
}

/**
 * Clear sticky beside only for an unambiguous stack-below (past row bottom).
 */
export function pointerExitsStickyBesideForStack(
    pointer: { x: number; y: number } | null,
    overRect: {
        left: number;
        width: number;
        top: number;
        bottom: number;
        right?: number;
    } | null,
    emptyPartnerRect: RectBox | null,
): boolean {
    if (pointer === null || overRect === null) {
        return false;
    }

    const zone = halfPartnerZoneRect(overRect, emptyPartnerRect);
    const rowBottom = Math.max(
        overRect.bottom,
        zone?.bottom ?? overRect.bottom,
    );

    // Match open-slot past-bottom (~relY > 1.05) — don't hold beside into unpair.
    return pointer.y > rowBottom + 6;
}

export function shouldKeepStickyBeside(
    sticky: StickyBesideState | null,
    activeId: number,
    pointer: { x: number; y: number } | null,
    overRect: {
        left: number;
        width: number;
        top: number;
        bottom: number;
        right?: number;
    } | null,
    emptyPartnerRect: RectBox | null,
    /**
     * Open-partner field under the pointer (DOM/geometry SoT). Sticky is per
     * overId — entering another half's empty column must retarget, not hold.
     */
    partnerUnderPointerId: number | null = null,
): boolean {
    if (sticky === null || sticky.activeId !== activeId) {
        return false;
    }

    // Another field's empty-partner zone wins over same-zone hysteresis.
    if (
        partnerUnderPointerId !== null &&
        partnerUnderPointerId !== sticky.overId
    ) {
        return false;
    }

    if (pointerExitsStickyBesideForStack(pointer, overRect, emptyPartnerRect)) {
        return false;
    }

    return pointerInStickyBesideZone(pointer, overRect, emptyPartnerRect);
}

/**
 * Among open empty-partner rects, pick the field whose slot contains the
 * pointer (nearest center on ties). Pure geometry — DOM hit-test is preferred
 * upstream when the slot is not covered by DragOverlay.
 */
export function openPartnerFieldIdFromEmptyRects(
    pointer: { x: number; y: number } | null,
    slots: ReadonlyArray<{
        overId: number;
        rect: RectBox;
    }>,
    activeId: number,
): number | null {
    if (pointer === null) {
        return null;
    }

    let bestId: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const slot of slots) {
        if (slot.overId === activeId) {
            continue;
        }

        const { rect } = slot;

        if (
            pointer.x < rect.left - 8 ||
            pointer.x > rect.right + 8 ||
            pointer.y < rect.top - 8 ||
            pointer.y > rect.bottom
        ) {
            continue;
        }

        const dist = Math.hypot(
            pointer.x - (rect.left + (rect.right - rect.left) / 2),
            pointer.y - (rect.top + (rect.bottom - rect.top) / 2),
        );

        if (dist < bestDist) {
            bestDist = dist;
            bestId = slot.overId;
        }
    }

    return bestId;
}
