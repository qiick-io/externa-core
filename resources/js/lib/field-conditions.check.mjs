/**
 * ponytail: self-check for boolean condition matching (HTML "1"/"0" vs true/false).
 * Run: node --experimental-strip-types resources/js/lib/field-conditions.check.mjs
 * (or duplicate the helpers inline if strip-types unavailable)
 */
import assert from 'node:assert/strict';

function asLooseBoolean(value) {
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') {
        return true;
    }
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off') {
        return false;
    }
    return null;
}

function valuesEqual(actual, expected) {
    const actualBool = asLooseBoolean(actual);
    const expectedBool = asLooseBoolean(expected);
    if (actualBool !== null && expectedBool !== null) {
        return actualBool === expectedBool;
    }
    return String(actual) === String(expected);
}

assert.equal(valuesEqual('1', true), true);
assert.equal(valuesEqual(1, true), true);
assert.equal(valuesEqual(true, true), true);
assert.equal(valuesEqual('0', false), true);
assert.equal(valuesEqual('1', false), false);
assert.equal(valuesEqual(false, true), false);

console.log('field-conditions.check: ok');
