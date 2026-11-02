import { cn } from '@/lib/utils';

/**
 * Shared height token for single-row collection field controls.
 * Matches shadcn `Input` / `Button` default (`h-9` = 36px).
 */
export const fieldControlHeight = 'h-9';

/**
 * Visible focus ring for controls (WCAG 2.4.7): full-opacity `--ring`, offset, no inset.
 * Prefer this over `ring-ring/50` / `ring-[3px]` / `ring-inset`.
 */
export const controlFocusRing =
    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Bordered chrome shared by naked single-row controls (boolean, slider, color, …). */
export const fieldControlChromeBase =
    'w-full rounded-md border border-input bg-transparent shadow-xs has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background';

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
