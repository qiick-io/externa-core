/*
 * The measurement behind the scroll cue of `useScrollRegion`, without imports
 * so the script tests can run it in Node.
 */

/** Horizontal scroll position of a scroll container, in CSS pixels. */
export type HorizontalScrollMetrics = {
    scrollLeft: number;
    scrollWidth: number;
    clientWidth: number;
    isRightToLeft: boolean;
};

/**
 * Which physical sides of a horizontal scroller hide content. In right-to-left
 * containers `scrollLeft` starts at 0 on the right and goes negative, so the
 * hidden width on the left is measured from the other end.
 *
 * @returns {{ hasHiddenLeft: boolean, hasHiddenRight: boolean }} One pixel of slack absorbs sub-pixel rounding.
 */
export function hiddenScrollSides({
    scrollLeft,
    scrollWidth,
    clientWidth,
    isRightToLeft,
}: HorizontalScrollMetrics): {
    hasHiddenLeft: boolean;
    hasHiddenRight: boolean;
} {
    const maximumScroll = Math.max(0, scrollWidth - clientWidth);
    const hiddenLeftWidth = isRightToLeft
        ? maximumScroll + scrollLeft
        : scrollLeft;
    const hiddenRightWidth = maximumScroll - hiddenLeftWidth;

    return {
        hasHiddenLeft: hiddenLeftWidth > 1,
        hasHiddenRight: hiddenRightWidth > 1,
    };
}
