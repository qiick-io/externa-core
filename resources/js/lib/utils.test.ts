import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/button';
import { cn } from './utils';

describe('cn with the control-size scale (#462)', () => {
    it('lets a caller height override a control-size variant', () => {
        expect(cn('h-control px-4', 'h-8')).toBe('px-4 h-8');
        expect(cn('size-control', 'size-7')).toBe('size-7');
        expect(cn('min-w-control-sm', 'min-w-0')).toBe('min-w-0');
    });

    it('gives Button sizes the shared control heights', () => {
        expect(buttonVariants({ size: 'sm' })).toContain('h-control-sm');
        expect(buttonVariants()).toContain('h-control');
        expect(buttonVariants({ size: 'lg' })).toContain('h-control-lg');
        expect(buttonVariants({ size: 'icon' })).toContain('size-control');
    });
});
