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
 * Half↔half already paired (no open column): bottom band unwraps to next row.
 */
export function halfPairedDropIntent(
    relativeX: number,
    relativeY: number,
    verticalIntent: FieldDropIntent,
): { intent: FieldDropIntent; layoutIntent: 'below-new-row' | null } {
    // Bottom half of a paired card unwraps to the next row (relY>1 = below card).
    if (relativeY > 0.45 && relativeX > 0.15 && relativeX < 0.85) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    return { intent: verticalIntent, layoutIntent: null };
}

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
    } | null,
    overHasOpenPartner: boolean,
): boolean {
    if (pointer === null || emptyPartnerRect === null) {
        return false;
    }

    const inEmpty =
        pointer.x >= emptyPartnerRect.left - 8 &&
        pointer.x <= emptyPartnerRect.right + 8 &&
        pointer.y >= emptyPartnerRect.top - 8 &&
        pointer.y <= emptyPartnerRect.bottom + 8;

    if (inEmpty) {
        return true;
    }

    if (!overHasOpenPartner || overRect === null) {
        return false;
    }

    return (
        pointer.x >= overRect.left + overRect.width * 0.45 &&
        pointer.y <= emptyPartnerRect.bottom + 12
    );
}
