import { useCallback } from 'react';

/**
 * Formats a user's display name from given name parts.
 *
 * @param firstName - Given name
 * @param lastName - Optional family name
 * @returns Trimmed full name
 */
export function formatUserDisplayName(
    firstName: string,
    lastName?: string | null,
): string {
    return [firstName, lastName].filter(Boolean).join(' ').trim();
}

/** Callback that derives avatar initials from name parts. */
export type GetInitialsFn = (
    firstName: string,
    lastName?: string | null,
) => string;

/**
 * Derives two-letter initials from given name parts (first + last initial).
 * Falls back to a single initial when only one name part is present.
 *
 * @param firstName - Given name
 * @param lastName - Optional family name
 * @returns Uppercase initials, or empty string when both parts are blank
 */
export function getInitialsFromParts(
    firstName: string,
    lastName?: string | null,
): string {
    const first = firstName.trim();
    const last = (lastName ?? '').trim();

    if (first === '' && last === '') {
        return '';
    }

    if (last === '') {
        return first.charAt(0).toUpperCase();
    }

    if (first === '') {
        return last.charAt(0).toUpperCase();
    }

    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/**
 * Returns a stable callback for deriving user avatar initials.
 *
 * @returns Memoized {@link GetInitialsFn}
 */
export function useInitials(): GetInitialsFn {
    return useCallback(
        (firstName: string, lastName?: string | null): string =>
            getInitialsFromParts(firstName, lastName),
        [],
    );
}
