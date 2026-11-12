import { describe, expect, it } from 'vite-plus/test';
import {
    toNumberArray,
    toNumberOrNull,
    toStringArray,
} from '@/components/collections/field-inputs/field-input-values';

describe('toNumberOrNull', () => {
    it('keeps finite numbers and numeric strings', () => {
        expect(toNumberOrNull(7)).toBe(7);
        expect(toNumberOrNull(' 12 ')).toBe(12);
    });

    it('returns null for empty or non-numeric values', () => {
        expect(toNumberOrNull('')).toBeNull();
        expect(toNumberOrNull('abc')).toBeNull();
        expect(toNumberOrNull(null)).toBeNull();
        expect(toNumberOrNull([1])).toBeNull();
    });
});

describe('toNumberArray', () => {
    it('reads ids from numbers, strings and junction objects', () => {
        expect(
            toNumberArray([
                1,
                '2',
                { related_item_id: 3 },
                { id: 4 },
                { other: true },
                'x',
            ]),
        ).toEqual([1, 2, 3, 4]);
    });

    it('returns an empty list for non-arrays', () => {
        expect(toNumberArray('1')).toEqual([]);
        expect(toNumberArray(null)).toEqual([]);
    });
});

describe('toStringArray', () => {
    it('stringifies array entries and ignores non-arrays', () => {
        expect(toStringArray([1, 2])).toEqual(['1', '2']);
        expect(toStringArray('a')).toEqual([]);
    });
});
