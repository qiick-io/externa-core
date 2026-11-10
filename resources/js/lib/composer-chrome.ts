import { cn } from '@/lib/utils';

/**
 * Shared look of the message composers (assistant and chat): one rounded box
 * holding an auto-growing textarea and an inline action row.
 */
export const composerFrameClass = cn(
    'rounded-2xl border border-border bg-background shadow-xs',
    'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
);

/** Borderless textarea inside {@link composerFrameClass}. */
export const composerTextareaClass = cn(
    'block w-full resize-none border-0 bg-transparent px-3 pt-3 pb-2',
    'text-sm text-foreground outline-none placeholder:text-muted-foreground',
    'disabled:cursor-not-allowed disabled:opacity-50',
);

/** Action row under the textarea, inside the frame. */
export const composerToolbarClass =
    'flex items-center justify-between gap-2 px-2 pb-2';

export const COMPOSER_MIN_TEXTAREA_HEIGHT_PX = 40;
export const COMPOSER_MAX_TEXTAREA_HEIGHT_PX = 168; // ~7 rows at text-sm
