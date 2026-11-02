const MAIN_CONTENT_ID = 'main-content';

/**
 * Focuses `#main-content` when focus has fallen on `<body>` / documentElement
 * after Inertia navigation or a destructive action (WCAG 2.4.3 / 2.4.11).
 */
export function focusPageMain(options?: { force?: boolean }): boolean {
    if (typeof document === 'undefined') {
        return false;
    }

    const main = document.getElementById(MAIN_CONTENT_ID);

    if (!(main instanceof HTMLElement)) {
        return false;
    }

    const active = document.activeElement;
    const focusIsLost =
        active === null ||
        active === document.body ||
        active === document.documentElement;

    if (!options?.force && !focusIsLost) {
        return false;
    }

    if (main.tabIndex < 0) {
        main.tabIndex = -1;
    }

    main.focus({ preventScroll: false });

    return document.activeElement === main;
}
