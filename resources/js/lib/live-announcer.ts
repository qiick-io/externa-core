export type LiveAnnouncePoliteness = 'polite' | 'assertive';

type LiveAnnounceOptions = {
    politeness?: LiveAnnouncePoliteness;
};

const POLITE_REGION_ID = 'externa-live-polite';
const ASSERTIVE_REGION_ID = 'externa-live-assertive';

/**
 * Ensures a document-level aria-live region exists and returns it.
 */
function ensureLiveRegion(
    politeness: LiveAnnouncePoliteness,
): HTMLElement | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const regionId =
        politeness === 'assertive' ? ASSERTIVE_REGION_ID : POLITE_REGION_ID;
    const existing = document.getElementById(regionId);

    if (existing) {
        return existing;
    }

    const region = document.createElement('div');
    region.id = regionId;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);

    return region;
}

/**
 * Announces a message once to assistive technology via a shared live region.
 * Assertive is reserved for errors; success/status stay polite.
 */
export function announce(
    message: string,
    options: LiveAnnounceOptions = {},
): void {
    const trimmed = message.trim();

    if (trimmed === '') {
        return;
    }

    const politeness = options.politeness ?? 'polite';
    const region = ensureLiveRegion(politeness);

    if (!region) {
        return;
    }

    // Clear first so identical consecutive messages are still announced.
    region.textContent = '';

    window.setTimeout(() => {
        region.textContent = trimmed;
    }, 20);
}

/**
 * Clears both live regions (tests / teardown).
 */
export function clearLiveAnnouncements(): void {
    if (typeof document === 'undefined') {
        return;
    }

    for (const regionId of [POLITE_REGION_ID, ASSERTIVE_REGION_ID]) {
        const region = document.getElementById(regionId);

        if (region) {
            region.textContent = '';
        }
    }
}
