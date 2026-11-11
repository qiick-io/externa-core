import { describe, expect, it } from 'vite-plus/test';

import {
    fieldControlChromeBase,
    fieldFocusRing,
    fieldOpenBorder,
} from './field-control-chrome';

describe('field-control-chrome focus styles', () => {
    it('colours the border and adds a soft halo without an offset ring', () => {
        expect(fieldFocusRing).toContain('focus-visible:border-ring');
        expect(fieldFocusRing).toContain('focus-visible:ring-3');
        expect(fieldFocusRing).toContain('focus-visible:ring-ring/30');
        expect(fieldControlChromeBase).toContain(
            'has-[:focus-visible]:border-ring',
        );
        expect(fieldControlChromeBase).toContain(
            'has-[:focus-visible]:ring-ring/30',
        );

        for (const className of [fieldFocusRing, fieldControlChromeBase]) {
            expect(className).not.toContain('ring-offset');
            expect(className).not.toContain('ring-inset');
        }
    });

    it('keeps the border coloured while a field popover is open', () => {
        expect(fieldOpenBorder).toContain('aria-expanded:border-ring');
        expect(fieldOpenBorder).toContain('data-[state=open]:border-ring');
    });
});
