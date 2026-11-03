import { cn } from '@/lib/utils';

/**
 * Shared height token for single-row collection field controls.
 * Default step of the control-size scale (#462, `--spacing-control` = 36px),
 * the same height as `Input` / `Button` / `SelectTrigger` default.
 */
export const fieldControlHeight = 'h-control';

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
    'flex h-control min-h-control items-center px-3',
);

/** Multi-option / growing chrome — height follows content. */
export const fieldControlChromeMulti = cn(fieldControlChromeBase, 'px-3 py-2');
