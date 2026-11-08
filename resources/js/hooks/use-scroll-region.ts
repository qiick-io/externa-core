import { useEffect, useState } from 'react';

/**
 * Keyboard access for a scroll container (WCAG 2.1.1, axe
 * `scrollable-region-focusable`): while its content overflows, the container
 * has `tabindex="0"` so arrow keys and Page Up / Down scroll it; when nothing
 * overflows it stays out of the tab order. The hook sets the attribute on the
 * node itself each time it measures, so do not pass `tabIndex` as well.
 *
 * @returns {(element: TElement | null) => void} Callback ref for the scroll container.
 */
export function useScrollRegion<TElement extends HTMLElement>(): (
    element: TElement | null,
) => void {
    const [element, setElement] = useState<TElement | null>(null);

    useEffect(() => {
        if (!element) {
            return;
        }

        const update = (): void => {
            const isScrollable =
                element.scrollHeight > element.clientHeight + 1 ||
                element.scrollWidth > element.clientWidth + 1;

            if (isScrollable) {
                element.tabIndex = 0;
            } else {
                element.removeAttribute('tabindex');
            }
        };
        // Absent in jsdom (unit tests) and very old browsers: fall back to
        // measuring on content changes only.
        const resizeObserver =
            typeof ResizeObserver === 'undefined'
                ? undefined
                : new ResizeObserver(update);
        const observeChildren = (): void => {
            resizeObserver?.disconnect();
            resizeObserver?.observe(element);

            // The content box (a table in an overflow-visible wrapper) can
            // grow without its wrapper resizing: watch two levels down.
            for (const child of Array.from(element.children)) {
                resizeObserver?.observe(child);

                for (const grandchild of Array.from(child.children)) {
                    resizeObserver?.observe(grandchild);
                }
            }

            update();
        };
        const mutationObserver = new MutationObserver(observeChildren);

        observeChildren();
        // Rows can be replaced or re-rendered (polling) without a resize of
        // the boxes watched above: re-measure on any content change.
        mutationObserver.observe(element, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        return () => {
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
        };
    }, [element]);

    return setElement;
}
