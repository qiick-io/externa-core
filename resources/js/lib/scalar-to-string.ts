/**
 * Text for a loosely typed value (field settings, option rows, API payload fields).
 *
 * `String(value)` turns an object into "[object Object]" and an array into a comma list;
 * neither is ever a valid setting, label or key. This keeps strings, numbers, booleans and
 * bigints as their text and returns the fallback for everything else (null, undefined,
 * objects, arrays, functions).
 *
 * @param value - Value of unknown type
 * @param fallback - Text used when the value is not a scalar
 * @returns The value as text, or the fallback
 */
export function scalarToString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
        return value;
    }

    if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
    ) {
        return String(value);
    }

    return fallback;
}
