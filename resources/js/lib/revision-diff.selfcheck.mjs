/**
 * ponytail: assert revision-diff canonicalize — fails if locale-null or datetime noise regresses.
 * Run: node resources/js/lib/revision-diff.selfcheck.mjs
 */
import assert from 'node:assert/strict';
import {
    canonicalizeDateTimeString,
    canonicalizeForCompare,
    fieldValuesEqual,
} from './revision-diff.ts';

assert.equal(
    canonicalizeDateTimeString('2024-02-01T12:00:00.000Z'),
    '2024-02-01T12:00',
);
assert.equal(canonicalizeDateTimeString('2024-02-01T12:00'), '2024-02-01T12:00');
assert.equal(
    fieldValuesEqual(
        { en: 'A' },
        { en: 'A', it: null },
    ),
    true,
);
assert.equal(
    fieldValuesEqual('2024-02-01T12:00:00.000Z', '2024-02-01T12:00'),
    true,
);
assert.equal(fieldValuesEqual({ en: 'A' }, { en: 'B' }), false);
assert.deepEqual(canonicalizeForCompare({ en: 'A', it: null }), { en: 'A' });

console.log('revision-diff.selfcheck: ok');
