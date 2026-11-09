/**
 * Helpers for client-side repeatable lists (blocks and many-to-any rows):
 * reorder an array and mint ids for new rows.
 */

/**
 * Returns a copy of `items` with the entry at `from` moved to `to`.
 * Out-of-range `from` returns the original array.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
    const next = items.slice();
    const [item] = next.splice(from, 1);

    if (item === undefined) {
        return items;
    }

    next.splice(to, 0, item);

    return next;
}

/**
 * Random UUID v4 for a new list row: `crypto.randomUUID()`, falling back to
 * `getRandomValues` (then `Math.random`) where the method is missing or
 * throws (some embedded webviews).
 */
export function newListItemId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        try {
            return crypto.randomUUID();
        } catch {
            // some embedded webviews expose the method but throw
        }
    }

    const bytes = new Uint8Array(16);

    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.getRandomValues === 'function'
    ) {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
