import { describe, expect, it } from 'vitest';

import {
    controlFocusRing,
    fieldControlChromeBase,
} from './field-control-chrome';

describe('field-control-chrome focus styles (#227)', () => {
    it('uses a full-opacity offset ring without inset or 50% opacity', () => {
        for (const className of [controlFocusRing, fieldControlChromeBase]) {
            expect(className).toContain('ring-ring');
            expect(className).toContain('ring-2');
            expect(className).toContain('ring-offset-2');
            expect(className).toContain('ring-offset-background');
            expect(className).not.toContain('ring-ring/50');
            expect(className).not.toContain('ring-[3px]');
            expect(className).not.toContain('ring-inset');
        }
    });
});
