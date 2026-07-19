import { useCallback } from 'react';

/** Callback that restores body pointer events after mobile sheet navigation closes. */
export type CleanupFn = () => void;

/**
 * Returns a cleanup callback for mobile navigation drawers.
 * Radix sheets may leave `pointer-events: none` on `document.body`; this removes it.
 *
 * @returns Memoized cleanup function
 */
export function useMobileNavigation(): CleanupFn {
    return useCallback(() => {
        document.body.style.removeProperty('pointer-events');
    }, []);
}
