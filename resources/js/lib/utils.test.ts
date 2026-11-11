import { describe, expect, it } from 'vite-plus/test';

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

    it('scales text and icons down at sm once merged by cn (#472)', () => {
        const smallButton = cn(buttonVariants({ size: 'sm' }));
        const smallIconButton = cn(buttonVariants({ size: 'icon-sm' }));

        expect(smallButton).toContain('text-xs');
        expect(smallButton).not.toContain('text-sm');
        expect(smallButton).toContain("[&_svg:not([class*='size-'])]:size-3.5");
        expect(smallButton).not.toContain(
            "[&_svg:not([class*='size-'])]:size-4",
        );
        expect(smallIconButton).toContain(
            "[&_svg:not([class*='size-'])]:size-3.5",
        );
        expect(buttonVariants()).toContain(
            "[&_svg:not([class*='size-'])]:size-4",
        );
    });
});
