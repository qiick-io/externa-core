/**
 * Helpers for revision compare / soft-apply (Directus-like).
 */

/**
 * Drop null/undefined/'' so `{en:"a"}` equals `{en:"a", it:null}`.
 * Canonicalize datetime-local vs ISO (`…T12:00` vs `…T12:00:00.000Z`) at minute precision.
 */
export function canonicalizeForCompare(value: unknown): unknown {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => canonicalizeForCompare(entry));
    }

    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};

        for (const [key, entry] of Object.entries(
            value as Record<string, unknown>,
        )) {
            const next = canonicalizeForCompare(entry);

            if (next === null) {
                continue;
            }

            out[key] = next;
        }

        return out;
    }

    if (typeof value === 'string' && looksLikeDateTime(value)) {
        return canonicalizeDateTimeString(value);
    }

    return value;
}

function looksLikeDateTime(value: string): boolean {
    // YYYY-MM-DD or YYYY-MM-DDTHH:mm…
    return /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value);
}

/**
 * ponytail: wall-clock minute precision — matches `<input type="datetime-local">` submit shape.
 * Avoid timezone conversion (naive `T12:00` vs `T12:00:00.000Z` would shift under local TZ).
 */
export function canonicalizeDateTimeString(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(
        /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/,
    );

    if (!match) {
        return trimmed;
    }

    const date = match[1];
    const hour = match[2] ?? '00';
    const minute = match[3] ?? '00';

    return `${date}T${hour}:${minute}`;
}

export function stableJson(value: unknown): string {
    try {
        return JSON.stringify(canonicalizeForCompare(value) ?? null);
    } catch {
        return String(value);
    }
}

export function fieldValuesEqual(a: unknown, b: unknown): boolean {
    return stableJson(a) === stableJson(b);
}

/**
 * Field names whose values differ between two item data snapshots.
 */
export function differingFieldNames(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
    fieldNames: string[],
): string[] {
    return fieldNames.filter(
        (name) => !fieldValuesEqual(left[name], right[name]),
    );
}
