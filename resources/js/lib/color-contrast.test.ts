import { describe, expect, it } from 'vitest';
import {
    brandPassesAa,
    contrastingForeground,
    meetsUiContrast,
    parseHexRgb,
} from '@/lib/color-contrast';

describe('parseHexRgb', () => {
    it('parses short and long hex, with or without #', () => {
        expect(parseHexRgb('#fff')).toEqual([1, 1, 1]);
        expect(parseHexRgb('000000')).toEqual([0, 0, 0]);
    });

    it('rejects empty and non-hex values', () => {
        expect(parseHexRgb(null)).toBeNull();
        expect(parseHexRgb('')).toBeNull();
        expect(parseHexRgb('#12345')).toBeNull();
        expect(parseHexRgb('teal')).toBeNull();
    });
});

describe('contrastingForeground', () => {
    it('picks white on dark and black on light backgrounds', () => {
        expect(contrastingForeground('#0f172a')).toBe('#ffffff');
        expect(contrastingForeground('#fde68a')).toBe('#000000');
    });

    it('returns null for an invalid colour', () => {
        expect(contrastingForeground('nope')).toBeNull();
        expect(contrastingForeground(undefined)).toBeNull();
    });
});

describe('brandPassesAa', () => {
    it('passes a dark teal brand and fails a pale yellow one', () => {
        expect(brandPassesAa('#0f766e', null)).toBe(true);
        expect(brandPassesAa('#fef9c3', null)).toBe(false);
    });

    it('checks the dark brand against the dark background', () => {
        // The dark brand equals the dark background, so it has no 3:1 contrast.
        expect(brandPassesAa('#0f766e', '#0e171e')).toBe(false);
    });

    it('fails an invalid hex and passes when no brand is set', () => {
        expect(brandPassesAa('nope', null)).toBe(false);
        expect(brandPassesAa(null, null)).toBe(true);
    });
});

describe('meetsUiContrast', () => {
    it('applies the 3:1 non-text minimum', () => {
        expect(meetsUiContrast('#767676', '#ffffff')).toBe(true);
        expect(meetsUiContrast('#cccccc', '#ffffff')).toBe(false);
    });
});
