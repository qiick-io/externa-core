import { describe, expect, it } from 'vitest';
import {
    defaultsToHalfWidth,
    getFieldGridColSpans,
    getFieldLayoutWidth,
} from './display';
import * as display from './display';

describe('defaultsToHalfWidth', () => {
    it('defaults number, color, and date to a half-width column', () => {
        expect(defaultsToHalfWidth({ type: 'number' })).toBe(true);
        expect(defaultsToHalfWidth({ type: 'color' })).toBe(true);
        expect(defaultsToHalfWidth({ type: 'date' })).toBe(true);
    });

    it('defaults slugified strings to a half-width column', () => {
        expect(
            defaultsToHalfWidth({
                type: 'string',
                settings: { slugify: true },
            }),
        ).toBe(true);
        expect(defaultsToHalfWidth({ type: 'string' })).toBe(false);
    });

    it('has no content-sized control class: controls fill their field', () => {
        expect(display).not.toHaveProperty('CONTENT_SIZED_CONTROL_CLASS');
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
