import { useEffect } from 'react';

const DEFAULT_DEBOUNCE_MS = 350;

/**
 * Debounces a server search visit when the local query differs from the last
 * server filter value. Skips the visit when they already match (mount /
 * pagination remounts) so page resets are avoided.
 *
 * @param search - Local controlled search string
 * @param serverSearch - Last search applied on the server (from Inertia props)
 * @param onSearch - Invoked with the local value after the debounce delay
 * @param delayMs - Debounce delay in milliseconds (default 350)
 */
export function useDebouncedServerSearch(
    search: string,
    serverSearch: string,
    onSearch: (value: string) => void,
    delayMs = DEFAULT_DEBOUNCE_MS,
): void {
    useEffect(() => {
        if (search === serverSearch) {
            return;
        }

        const timer = window.setTimeout(() => {
            onSearch(search);
        }, delayMs);

        return () => {
            window.clearTimeout(timer);
        };
    }, [search, serverSearch, onSearch, delayMs]);
}
