// ponytail: self-check — run: node resources/js/lib/collection-field-drop.check.mjs
import assert from 'node:assert/strict';
import {
    halfOpenSlotDropIntent,
    halfOccupiedInsertDropIntent,
    resolveHalfDropOnEnd,
    rowBreakIdsForDropFrame,
    shouldForceHalfRowBreakForVerticalDrop,
    targetIndexForFieldDrop,
} from './collection-field-drop.ts';

assert.equal(targetIndexForFieldDrop(0, 2, 'after'), 2);
assert.equal(targetIndexForFieldDrop(2, 0, 'before'), 0);
assert.equal(targetIndexForFieldDrop(1, 1, 'after'), null);

assert.equal(
    shouldForceHalfRowBreakForVerticalDrop('half', 'full', null),
    true,
);
assert.equal(
    shouldForceHalfRowBreakForVerticalDrop('half', 'half', null),
    false,
);

const openBeside = halfOpenSlotDropIntent(0.8, 0.4);
assert.equal(openBeside.layoutIntent, 'beside');
assert.equal(openBeside.intent, 'after');

const openStack = halfOpenSlotDropIntent(0.5, 1.1);
assert.equal(openStack.layoutIntent, 'below-new-row');

const occupied = halfOccupiedInsertDropIntent(0.7, 0.4, true);
assert.equal(occupied.layoutIntent, 'beside');
assert.equal(occupied.intent, 'before');

const resolved = resolveHalfDropOnEnd({
    activeWidth: 'half',
    overWidth: 'half',
    relativeX: 0.8,
    relativeY: 0.3,
    verticalIntent: 'after',
    overHasOpenPartner: true,
    overIsLeadingInOccupiedPair: null,
});
assert.equal(resolved.layoutIntent, 'beside');

const breaks = rowBreakIdsForDropFrame(
    [10, 20],
    30,
    10,
    'beside',
    'after',
    false,
    false,
    null,
);
assert.ok(!breaks.has(30));
assert.ok(breaks.has(10));
assert.ok(breaks.has(20));

console.log('collection-field-drop.check: ok');
