/**
 * ponytail: self-check for item-field-raw-value helpers (mirrored).
 * Run: node resources/js/lib/item-field-raw-value.check.mjs
 */
import assert from 'node:assert/strict';

function stringifyFieldRawValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function parseFieldRawValue(text) {
    const trimmed = text.trim();
    if (trimmed === '') return '';
    try {
        return JSON.parse(trimmed);
    } catch {
        return text;
    }
}

function clearFieldRawValue(sample) {
    if (Array.isArray(sample)) return [];
    if (sample !== null && typeof sample === 'object') return null;
    if (typeof sample === 'boolean') return false;
    if (typeof sample === 'number') return null;
    return '';
}

function localeSliceOf(value, locale) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value[locale];
    }
    return undefined;
}

function withLocaleSlice(current, locale, slice) {
    const base =
        current && typeof current === 'object' && !Array.isArray(current)
            ? { ...current }
            : {};
    base[locale] = slice;
    return base;
}

assert.equal(stringifyFieldRawValue('hello'), 'hello');
assert.equal(stringifyFieldRawValue(null), '');
assert.equal(stringifyFieldRawValue(undefined), '');
assert.equal(stringifyFieldRawValue({ a: 1 }), '{\n  "a": 1\n}');
assert.equal(stringifyFieldRawValue([1, 2]), '[\n  1,\n  2\n]');

assert.deepEqual(parseFieldRawValue('{"a":1}'), { a: 1 });
assert.deepEqual(parseFieldRawValue('[1,2]'), [1, 2]);
assert.equal(parseFieldRawValue('plain'), 'plain');
assert.equal(parseFieldRawValue(''), '');
assert.equal(parseFieldRawValue('  '), '');
// Invalid JSON kept as plain text (including leading/trailing space preserved on non-empty non-JSON)
assert.equal(parseFieldRawValue('not {json'), 'not {json');

assert.deepEqual(clearFieldRawValue(['x']), []);
assert.equal(clearFieldRawValue({ a: 1 }), null);
assert.equal(clearFieldRawValue('x'), '');
assert.equal(clearFieldRawValue(true), false);
assert.equal(clearFieldRawValue(42), null);

assert.equal(localeSliceOf({ en: 'a', it: 'b' }, 'it'), 'b');
assert.equal(localeSliceOf('scalar', 'en'), undefined);
assert.equal(localeSliceOf(['x'], 'en'), undefined);

assert.deepEqual(withLocaleSlice({ en: 'a', it: 'b' }, 'it', 'c'), {
    en: 'a',
    it: 'c',
});
assert.deepEqual(withLocaleSlice(null, 'en', 'x'), { en: 'x' });
assert.deepEqual(withLocaleSlice('scalar', 'en', 'x'), { en: 'x' });

// Round-trip: clear locale slice then merge back
const cleared = clearFieldRawValue(localeSliceOf({ en: 'hi' }, 'en'));
assert.equal(cleared, '');
assert.deepEqual(withLocaleSlice({ en: 'hi', it: 'ciao' }, 'en', cleared), {
    en: '',
    it: 'ciao',
});

console.log('item-field-raw-value.check: ok');
