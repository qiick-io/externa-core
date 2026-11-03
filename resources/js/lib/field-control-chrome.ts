import { cn } from '@/lib/utils';

/**
 * Shared height token for single-row collection field controls.
 * Default step of the control-size scale (#462, #472, `--spacing-control` = 32px),
 * the same height as `Input` / `Button` / `SelectTrigger` default.
 */
export const fieldControlHeight = 'h-control';

/**
 * Focus style for text-like fields (Input, Textarea, Select, combobox triggers):
 * the border turns `--ring` (contrast-checked against the surface, #455), which is
 * the WCAG 2.4.7 / 1.4.11 indicator, plus a soft 3px halo hugging the border.
 * No offset: an offset ring doubles the outline and gets clipped by scroll
 * containers. Buttons, toggles, checkboxes and switches keep the offset ring.
 */
export const fieldFocusRing =
    'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

/** Border colour while a field's popover / listbox is open (Select, combobox). */
export const fieldOpenBorder =
    'aria-expanded:border-ring data-[state=open]:border-ring';

/** Bordered chrome shared by naked single-row controls (boolean, slider, color, …). */
export const fieldControlChromeBase =
    'w-full rounded-md border border-input bg-transparent shadow-xs has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30';

/** Single-line chrome — fixed Input height. */
export const fieldControlChromeSingle = cn(
    fieldControlChromeBase,
    'flex h-control min-h-control items-center px-3',
);

/** Multi-option / growing chrome — height follows content. */
export const fieldControlChromeMulti = cn(fieldControlChromeBase, 'px-3 py-2');
