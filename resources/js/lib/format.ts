/**
 * Shared display formatters (locale, dates, numbers, bytes, initials, datetime-local values).
 */
import i18n from '@/lib/i18n';

/**
 * Resolve the active app locale for Intl formatters (falls back to English).
 */
export function appLocale(language = i18n.language): string {
    const raw = (language || 'en').split('-')[0]?.toLowerCase() ?? 'en';

    if (raw === 'it' || raw === 'de' || raw === 'en') {
        return raw;
    }

    return 'en';
}

/**
 * BCP 47 tag for Web Speech Recognition from the app UI locale.
 */
export function speechRecognitionLang(language = i18n.language): string {
    switch (appLocale(language)) {
        case 'it':
            return 'it-IT';
        case 'de':
            return 'de-DE';
        default:
            return 'en-US';
    }
}

/**
 * Locale-aware date/time formatting using the active i18n language.
 */
export function formatDateTime(
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
    language = i18n.language,
): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString(appLocale(language), options);
}

/**
 * Locale-aware number formatting using the active i18n language.
 */
export function formatNumber(
    value: number,
    options?: Intl.NumberFormatOptions,
    language = i18n.language,
): string {
    return value.toLocaleString(appLocale(language), options);
}

/**
 * Joins a user's given and family name into a display name.
 *
 * @param firstName - Given name
 * @param lastName - Optional family name
 * @returns Trimmed full name (empty when both parts are blank)
 */
export function formatUserDisplayName(
    firstName: string,
    lastName?: string | null,
): string {
    return [firstName, lastName].filter(Boolean).join(' ').trim();
}

/**
 * Derives avatar initials from a display name: the first letter of the first
 * and last word ("Maria Grazia Rossi" → "MR"), the first two letters of a
 * single word. The app's only initials helper (users, groups, chat faces).
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

    return `${parts[0]!.charAt(0)}${parts.at(-1)!.charAt(0)}`.toUpperCase();
}

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
