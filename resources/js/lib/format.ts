/**
 * Shared display formatters (bytes, initials, datetime-local values).
 */

type DatetimeLocalInput =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null
    | undefined;

/**
 * Formats a byte count using binary units (B through TB).
 *
 * @param bytes - Raw byte count; null/undefined yield `empty`
 * @param empty - Placeholder when bytes are null/undefined (default `'—'`)
 * @returns Human-readable size string
 */
export function formatBytes(
    bytes: number | null | undefined,
    empty = '—',
): string {
    if (bytes === null || bytes === undefined) {
        return empty;
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    const rounded = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);

    return `${rounded} ${units[unitIndex]}`;
}

/**
 * Formats a file-manager size; treats `0` and `null` as empty.
 *
 * @param bytes - File size in bytes, or null
 * @returns Human-readable size, or `'—'` when empty
 */
export function formatFileSize(bytes: number | null): string {
    if (bytes === null || bytes === 0) {
        return '—';
    }

    return formatBytes(bytes);
}

/**
 * Derives avatar initials from a display name (up to two letters).
 *
 * @param name - Full display name
 * @returns Uppercase initials, or `'?'` when blank
 */
export function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0]!.slice(0, 2).toUpperCase();
    }

    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase() || '?';
}

/**
 * Converts an ISO/date value to an `<input type="datetime-local">` string.
 *
 * @param value - ISO string, date-only string, or other scalar
 * @param includeSeconds - When true, include `:ss` (default false)
 * @returns Local datetime string, or empty when unset/invalid
 */
export function toDatetimeLocalValue(
    value: DatetimeLocalInput,
    includeSeconds = false,
): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const stringValue = String(value);

    if (/^\d{4}-\d{2}-\d{2}T/.test(stringValue)) {
        return includeSeconds
            ? stringValue.slice(0, 19)
            : stringValue.slice(0, 16);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
        return `${stringValue}T00:00${includeSeconds ? ':00' : ''}`;
    }

    const parsedDate = new Date(stringValue);

    if (Number.isNaN(parsedDate.getTime())) {
        return stringValue;
    }

    const pad = (part: number) => String(part).padStart(2, '0');

    const formatted = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;

    return includeSeconds
        ? `${formatted}:${pad(parsedDate.getSeconds())}`
        : formatted;
}
