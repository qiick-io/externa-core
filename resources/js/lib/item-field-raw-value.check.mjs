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

function withLocaleSlice(current, locale, slice) {
    const base =
        current && typeof current === 'object' && !Array.isArray(current)
            ? { ...current }
            : {};
    base[locale] = slice;
    return base;
}

assert.equal(stringifyFieldRawValue('hello'), 'hello');
assert.equal(stringifyFieldRawValue({ a: 1 }), '{\n  "a": 1\n}');
assert.deepEqual(parseFieldRawValue('{"a":1}'), { a: 1 });
assert.equal(parseFieldRawValue('plain'), 'plain');
assert.equal(parseFieldRawValue(''), '');
assert.deepEqual(clearFieldRawValue(['x']), []);
assert.equal(clearFieldRawValue({ a: 1 }), null);
assert.equal(clearFieldRawValue('x'), '');
assert.deepEqual(withLocaleSlice({ en: 'a', it: 'b' }, 'it', 'c'), {
    en: 'a',
    it: 'c',
});

console.log('item-field-raw-value.check: ok');
