/**
 * Smoke check for field drop insert helpers.
 * Run: node resources/js/lib/collection-field-drop.check.mjs
 */

function targetIndexForFieldDrop(oldIndex, overIndex, intent) {
    let insertIndex = intent === 'before' ? overIndex : overIndex + 1;

    if (oldIndex < insertIndex) {
        insertIndex -= 1;
    }

    if (oldIndex === insertIndex) {
        return null;
    }

    return insertIndex;
}

function shouldForceHalfRowBreakForVerticalDrop(
    activeLayoutWidth,
    overLayoutWidth,
    layoutIntent,
) {
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

function halfOpenSlotDropIntent(relativeX, relativeY) {
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

function halfPairedDropIntent(relativeX, relativeY, verticalIntent) {
    if (relativeY > 0.45 && relativeX > 0.15 && relativeX < 0.85) {
        return { intent: 'after', layoutIntent: 'below-new-row' };
    }

    return { intent: verticalIntent, layoutIntent: null };
}

function intentForLayoutDrop(intent, layoutIntent) {
    if (layoutIntent === 'below-new-row') {
        return 'after';
    }

    return intent;
}

function openPartnerBesideFromPointer(pointer, emptyPartnerRect, overRect, overHasOpenPartner) {
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

function arrayMove(array, from, to) {
    const next = array.slice();
    next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0]);
    return next;
}

function reorder(ids, oldIndex, overIndex, intent) {
    const target = targetIndexForFieldDrop(oldIndex, overIndex, intent);
    if (target === null) return ids;
    return arrayMove(ids, oldIndex, target);
}

// [title, status, city] — drag title before city (moving down): city must shift, not swap.
{
    const ids = ['title', 'status', 'city'];
    const next = reorder(ids, 0, 2, 'before');
    if (next.join(',') !== 'status,title,city') {
        throw new Error(`half before full (down): ${next.join(',')}`);
    }
}

// Naive arrayMove(old, over) wrongly yields status,city,title — half replaces city slot.
{
    const ids = ['title', 'status', 'city'];
    const naive = arrayMove(ids, 0, 2);
    if (naive.join(',') !== 'status,city,title') {
        throw new Error(`sanity naive replace: ${naive.join(',')}`);
    }
}

// Drag status before city when already adjacent — no-op.
{
    const ids = ['title', 'status', 'city'];
    const next = reorder(ids, 1, 2, 'before');
    if (next.join(',') !== 'title,status,city') {
        throw new Error(`adjacent before no-op: ${next.join(',')}`);
    }
}

// Drag status after city.
{
    const ids = ['title', 'status', 'city'];
    const next = reorder(ids, 1, 2, 'after');
    if (next.join(',') !== 'title,city,status') {
        throw new Error(`half after full: ${next.join(',')}`);
    }
}

// Drag half up from below full to before full.
{
    const ids = ['city', 'title', 'status'];
    const next = reorder(ids, 1, 0, 'before');
    if (next.join(',') !== 'title,city,status') {
        throw new Error(`half before full (up): ${next.join(',')}`);
    }
}

// Row-break force for half↔full vertical only.
if (!shouldForceHalfRowBreakForVerticalDrop('half', 'full', null)) {
    throw new Error('expected force break half→full');
}
if (shouldForceHalfRowBreakForVerticalDrop('half', 'half', null)) {
    throw new Error('no force break half→half');
}
if (shouldForceHalfRowBreakForVerticalDrop('half', 'full', 'beside')) {
    throw new Error('no force break when beside');
}

// Open-slot: right column stays beside (even low on the card); past bottom stacks.
{
    const rightLow = halfOpenSlotDropIntent(0.5, 0.9);
    if (rightLow.layoutIntent !== 'beside') {
        throw new Error(`open-slot right-low: ${rightLow.layoutIntent}`);
    }

    const pastBottom = halfOpenSlotDropIntent(0.5, 1.1);
    if (pastBottom.layoutIntent !== 'below-new-row') {
        throw new Error(`open-slot past-bottom: ${pastBottom.layoutIntent}`);
    }

    const rightMid = halfOpenSlotDropIntent(0.8, 0.4);
    if (rightMid.layoutIntent !== 'beside' || rightMid.intent !== 'after') {
        throw new Error(`open-slot right: ${JSON.stringify(rightMid)}`);
    }

    const leftMid = halfOpenSlotDropIntent(0.2, 0.4);
    if (leftMid.layoutIntent !== 'beside' || leftMid.intent !== 'before') {
        throw new Error(`open-slot left: ${JSON.stringify(leftMid)}`);
    }

    const leftBottom = halfOpenSlotDropIntent(0.2, 0.8);
    if (leftBottom.layoutIntent !== 'below-new-row') {
        throw new Error(`open-slot left-bottom: ${leftBottom.layoutIntent}`);
    }
}

{
    const pairedBottom = halfPairedDropIntent(0.5, 0.8, 'before');
    if (pairedBottom.layoutIntent !== 'below-new-row') {
        throw new Error('paired bottom should unwrap');
    }

    if (intentForLayoutDrop('before', 'below-new-row') !== 'after') {
        throw new Error('below-new-row must force after');
    }

    if (intentForLayoutDrop('before', 'beside') !== 'before') {
        throw new Error('beside keeps vertical intent');
    }

    const pairedTop = halfPairedDropIntent(0.5, 0.2, 'before');
    if (pairedTop.layoutIntent !== null || pairedTop.intent !== 'before') {
        throw new Error(`paired top: ${JSON.stringify(pairedTop)}`);
    }
}

// Unpair: [a,b] drag a below b → after + break on a → [b,a] with trailing break.
{
    const ids = ['a', 'b'];
    const next = reorder(ids, 0, 1, intentForLayoutDrop('before', 'below-new-row'));
    if (next.join(',') !== 'b,a') {
        throw new Error(`unpair order: ${next.join(',')}`);
    }
}

{
    const empty = { left: 830, right: 1376, top: 587, bottom: 661 };
    const over = { left: 272, width: 1104 };
    if (!openPartnerBesideFromPointer({ x: 1103, y: 612 }, empty, over, true)) {
        throw new Error('open partner beside should hit empty column');
    }
    if (openPartnerBesideFromPointer({ x: 300, y: 800 }, empty, over, true)) {
        throw new Error('far below should not be beside');
    }
}

console.log('collection-field-drop.check.mjs: ok');
