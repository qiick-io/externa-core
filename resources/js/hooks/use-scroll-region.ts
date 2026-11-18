import { useEffect, useState } from 'react';
import { hiddenScrollSides } from '@/lib/scroll-cue';

function canScroll(overflow: string): boolean {
    return overflow === 'auto' || overflow === 'scroll';
}

/**
 * Keyboard access and a visible cue for a scroll container.
 *
 * - WCAG 2.1.1, axe `scrollable-region-focusable`: while its content
 *   overflows, the container has `tabindex="0"` so arrow keys and Page Up /
 *   Down scroll it; with `accessibleName` it is also a named
 *   `role="region"`. When nothing overflows it stays out of the tab order and
 *   the attributes it added are removed.
 * - Scroll cue (`docs/list-page.md`): `data-scroll-cue-left` /
 *   `data-scroll-cue-right` mark the sides that hide content, and
 *   `--scroll-cue-scrollbar` holds the vertical scrollbar width; the theme
 *   fades the content out on those sides. Updated on scroll, resize and
 *   content changes.
 *
 * The hook sets the attributes on the node itself each time it measures, so
 * do not pass `tabIndex`, `role` or `aria-label` as well. A container whose
 * own `overflow` is `visible` (a table inside a `TablePanel`) never counts as
 * scrollable: its parent scrolls instead.
 *
 * @param {string} [accessibleName] - Translated name of the region while it scrolls ("Scrollable table").
 * @returns {(element: TElement | null) => void} Callback ref for the scroll container.
 */
export function useScrollRegion<TElement extends HTMLElement>(
    accessibleName?: string,
): (element: TElement | null) => void {
    const [element, setElement] = useState<TElement | null>(null);

    useEffect(() => {
        if (!element) {
            return;
        }

        const update = (): void => {
            const style = getComputedStyle(element);
            const isScrollableX =
                canScroll(style.overflowX) &&
                element.scrollWidth > element.clientWidth + 1;
            const isScrollableY =
                canScroll(style.overflowY) &&
                element.scrollHeight > element.clientHeight + 1;
            const { hasHiddenLeft, hasHiddenRight } = isScrollableX
                ? hiddenScrollSides({
                      scrollLeft: element.scrollLeft,
                      scrollWidth: element.scrollWidth,
                      clientWidth: element.clientWidth,
                      isRightToLeft: style.direction === 'rtl',
                  })
                : { hasHiddenLeft: false, hasHiddenRight: false };
            const verticalScrollbarWidth =
                element.offsetWidth -
                element.clientWidth -
                parseFloat(style.borderLeftWidth) -
                parseFloat(style.borderRightWidth);

            if (isScrollableX || isScrollableY) {
                element.tabIndex = 0;

                if (accessibleName) {
                    element.setAttribute('role', 'region');
                    element.setAttribute('aria-label', accessibleName);
                }
            } else {
                element.removeAttribute('tabindex');

                if (accessibleName) {
                    element.removeAttribute('role');
                    element.removeAttribute('aria-label');
                }
            }

            element.toggleAttribute('data-scroll-cue-left', hasHiddenLeft);
            element.toggleAttribute('data-scroll-cue-right', hasHiddenRight);

            if (verticalScrollbarWidth > 0) {
                element.style.setProperty(
                    '--scroll-cue-scrollbar',
                    `${verticalScrollbarWidth}px`,
                );
            } else {
                element.style.removeProperty('--scroll-cue-scrollbar');
            }
        };
        // Absent in jsdom (unit tests) and very old browsers: fall back to
        // measuring on content changes and scroll only.
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
        // The cue follows the scroll position.
        element.addEventListener('scroll', update, { passive: true });

        return () => {
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
            element.removeEventListener('scroll', update);
        };
    }, [element, accessibleName]);

    return setElement;
}
