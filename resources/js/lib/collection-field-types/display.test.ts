import { describe, expect, it } from 'vitest';
import {
    CONTENT_SIZED_CONTROL_CLASS,
    getFieldGridColSpans,
    getFieldLayoutWidth,
    isContentSizedField,
} from './display';

describe('isContentSizedField', () => {
    it('treats number, color, and date as content-sized', () => {
        expect(isContentSizedField({ type: 'number' })).toBe(true);
        expect(isContentSizedField({ type: 'color' })).toBe(true);
        expect(isContentSizedField({ type: 'date' })).toBe(true);
    });

    it('treats slugified strings as content-sized', () => {
        expect(
            isContentSizedField({
                type: 'string',
                settings: { slugify: true },
            }),
        ).toBe(true);
        expect(isContentSizedField({ type: 'string' })).toBe(false);
    });

    it('exposes a content-sized control class token', () => {
        expect(CONTENT_SIZED_CONTROL_CLASS).toContain('w-auto');
    });
});

describe('getFieldLayoutWidth', () => {
    it('defaults short types to half when layout_width is unset', () => {
        expect(getFieldLayoutWidth(null, 'number')).toBe('half');
        expect(getFieldLayoutWidth({}, 'color')).toBe('half');
        expect(getFieldLayoutWidth({ slugify: '1' }, 'string')).toBe('half');
    });

    it('honours an explicit layout_width over short-type defaults', () => {
        expect(getFieldLayoutWidth({ layout_width: 'full' }, 'number')).toBe(
            'full',
        );
        expect(getFieldLayoutWidth({ layout_width: 'fill' }, 'date')).toBe(
            'fill',
        );
    });

    it('defaults other types to full', () => {
        expect(getFieldLayoutWidth(null, 'textarea')).toBe('full');
        expect(getFieldLayoutWidth(null)).toBe('full');
    });
});

describe('getFieldGridColSpans short defaults', () => {
    it('pairs consecutive short fields on one row', () => {
        expect(
            getFieldGridColSpans([
                { type: 'number', settings: null },
                { type: 'color', settings: null },
                { type: 'textarea', settings: null },
            ]),
        ).toEqual([1, 1, 2]);
    });
});
