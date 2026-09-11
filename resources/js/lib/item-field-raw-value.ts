/**
 * Helpers for Directus-like raw field value copy / paste / edit on item forms.
 */

/** Serialize a field value for the raw editor / clipboard. */
export function stringifyFieldRawValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

/**
 * Parse clipboard / textarea text into a field value.
 * JSON when valid; otherwise keep as plain string (never throw).
 */
export function parseFieldRawValue(text: string): unknown {
    const trimmed = text.trim();

    if (trimmed === '') {
        return '';
    }

    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return text;
    }
}

/** Empty value shaped like the field's current/initial type. */
export function clearFieldRawValue(sample: unknown): unknown {
    if (Array.isArray(sample)) {
        return [];
    }

    if (sample !== null && typeof sample === 'object') {
        return null;
    }

    if (typeof sample === 'boolean') {
        return false;
    }

    if (typeof sample === 'number') {
        return null;
    }

    return '';
}

/**
 * Read a live value from named form controls for `data[field]` or `data[field][locale]`.
 * Returns undefined when the form has no matching controls (caller falls back).
 */
export function readFieldRawFromForm(
    form: HTMLFormElement,
    fieldName: string,
    locale?: string | null,
): unknown | undefined {
    const base =
        locale != null && locale !== ''
            ? `data[${fieldName}][${locale}]`
            : `data[${fieldName}]`;

    const data = new FormData(form);
    const matches: { key: string; value: string }[] = [];

    for (const [key, value] of data.entries()) {
        if (typeof value !== 'string') {
            continue;
        }

        if (key === base || key === `${base}[]` || key.startsWith(`${base}[`)) {
            matches.push({ key, value });
        }
    }

    if (matches.length === 0) {
        return undefined;
    }

    if (matches.length === 1 && matches[0]!.key === base) {
        return matches[0]!.value;
    }

    if (matches.every((entry) => entry.key === `${base}[]`)) {
        return matches.map((entry) => entry.value);
    }

    // Nested / multi-key — prefer assembled object from caller defaults
    return undefined;
}

/** Pick the locale slice of a translatable field value. */
export function localeSliceOf(value: unknown, locale: string): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return (value as Record<string, unknown>)[locale];
    }

    return undefined;
}

/** Merge a locale slice back into a translatable field object. */
export function withLocaleSlice(
    current: unknown,
    locale: string,
    slice: unknown,
): Record<string, unknown> {
    const base =
        current && typeof current === 'object' && !Array.isArray(current)
            ? { ...(current as Record<string, unknown>) }
            : {};

    base[locale] = slice;

    return base;
}
