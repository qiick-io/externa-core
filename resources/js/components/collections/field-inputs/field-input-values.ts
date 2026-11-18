import type { DefaultValue } from '@/components/collections/field-inputs/field-input-props';

/**
 * Single file / relation id from a stored value; null when it is empty or not numeric.
 */
export function toNumberOrNull(value: DefaultValue): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

/**
 * List of file / related item ids from a stored value; entries that are not ids are dropped.
 */
export function toNumberArray(value: DefaultValue): number[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => {
            if (typeof entry === 'number' || typeof entry === 'string') {
                return Number(entry);
            }

            // M2M / relation payloads may arrive as junction objects
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                return Number(
                    (entry as { related_item_id?: unknown; id?: unknown })
                        .related_item_id ?? (entry as { id?: unknown }).id,
                );
            }

            return Number.NaN;
        })
        .filter((entry) => Number.isFinite(entry));
}

/**
 * List of choice values from a stored value; anything but an array is no selection.
 */
export function toStringArray(value: DefaultValue): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map(String);
}
