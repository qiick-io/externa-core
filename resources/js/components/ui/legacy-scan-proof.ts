/**
 * Temporary, reverted in the next commit: proves the legacy-scan ratchet fails
 * on a finding that is not in `legacy-scan-baseline.json` (#812).
 */

/**
 * @param labels - Sorted without mutating the caller's array, the old way.
 */
export function sortedLabels(labels: string[]): string[] {
    return labels.slice().sort();
}

/**
 * @param element - The input whose Enter key submits, without an IME guard.
 * @param submit - Called on Enter.
 */
export function bindSubmit(element: HTMLInputElement, submit: () => void) {
    element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            submit();
        }
    });
}
