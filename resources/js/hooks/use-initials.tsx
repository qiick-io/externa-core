import { useCallback } from 'react';

export function formatUserDisplayName(
    firstName: string,
    lastName?: string | null,
): string {
    return [firstName, lastName].filter(Boolean).join(' ').trim();
}

export type GetInitialsFn = (
    firstName: string,
    lastName?: string | null,
) => string;

/**
 * Initials from given name parts (first letter of first name + first letter of last name).
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

export function useInitials(): GetInitialsFn {
    return useCallback(
        (firstName: string, lastName?: string | null): string =>
            getInitialsFromParts(firstName, lastName),
        [],
    );
}
