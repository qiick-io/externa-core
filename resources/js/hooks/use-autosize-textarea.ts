import { useEffect } from 'react';
import type { RefObject } from 'react';
import {
    COMPOSER_MAX_TEXTAREA_HEIGHT_PX,
    COMPOSER_MIN_TEXTAREA_HEIGHT_PX,
} from '@/lib/composer-chrome';

/**
 * Grow a textarea with its content between the composer min and max heights,
 * scrolling only past the max.
 *
 * @param textareaRef - Textarea to size
 * @param value - Current text (re-measures on change)
 */
export function useAutosizeTextarea(
    textareaRef: RefObject<HTMLTextAreaElement | null>,
    value: string,
): void {
    useEffect(() => {
        const textarea = textareaRef.current;

        if (!textarea) {
            return;
        }

        textarea.style.height = '0px';
        const nextHeight = Math.min(
            Math.max(textarea.scrollHeight, COMPOSER_MIN_TEXTAREA_HEIGHT_PX),
            COMPOSER_MAX_TEXTAREA_HEIGHT_PX,
        );
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY =
            textarea.scrollHeight > COMPOSER_MAX_TEXTAREA_HEIGHT_PX
                ? 'auto'
                : 'hidden';
    }, [textareaRef, value]);
}
