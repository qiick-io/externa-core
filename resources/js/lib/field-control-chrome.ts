import { cn } from '@/lib/utils';

/**
 * Shared height token for single-row collection field controls.
 * Matches shadcn `Input` / `Button` default (`h-9` = 36px).
 */
export const fieldControlHeight = 'h-9';

/** Bordered chrome shared by naked single-row controls (boolean, slider, color, …). */
export const fieldControlChromeBase =
    'w-full rounded-md border border-input bg-transparent shadow-xs has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-inset';

/** Single-line chrome — fixed Input height. */
export const fieldControlChromeSingle = cn(
    fieldControlChromeBase,
    'flex h-9 min-h-9 items-center px-3',
);

/** Multi-option / growing chrome — height follows content. */
export const fieldControlChromeMulti = cn(
    fieldControlChromeBase,
    'px-3 py-1.5',
);
