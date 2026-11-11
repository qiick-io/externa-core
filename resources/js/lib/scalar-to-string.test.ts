import { describe, expect, it } from 'vite-plus/test';

import { scalarToString } from '@/lib/scalar-to-string';

describe('scalarToString', () => {
    it('keeps strings and converts numbers, booleans and bigints', () => {
        expect(scalarToString('title')).toBe('title');
        expect(scalarToString(42)).toBe('42');
        expect(scalarToString(false)).toBe('false');
        expect(scalarToString(10n)).toBe('10');
    });

    it('returns the fallback instead of "[object Object]" or a comma list', () => {
        expect(scalarToString(null, 'datetime')).toBe('datetime');
        expect(scalarToString(undefined)).toBe('');
        expect(scalarToString({ label: 'x' }, 'all')).toBe('all');
        expect(scalarToString(['a', 'b'])).toBe('');
    });

    it('keeps an empty string rather than the fallback', () => {
        expect(scalarToString('', 'fallback')).toBe('');
    });
});
