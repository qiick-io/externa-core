import { useEffect, useState } from 'react';
import { FIELD_KEY_PATTERN, slugify } from '@/lib/slugify';

/**
 * Client-side check of the field key while the user types, 350 ms after the
 * last change: invalid characters or a key already used by a sibling field.
 * The server validates again on save; its error wins in the form.
 *
 * @returns The error message, or undefined while the key is empty or valid
 */
export function useDebouncedFieldKeyError(
    fieldKey: string,
    siblingFieldNames: string[],
): string | undefined {
    const [debouncedKeyError, setDebouncedKeyError] = useState<
        string | undefined
    >();

    useEffect(() => {
        const handle = window.setTimeout(() => {
            // Trailing `-` while typing → compare the finalized slug; leave legacy `_` keys alone.
            const key = FIELD_KEY_PATTERN.test(fieldKey)
                ? fieldKey
                : slugify(fieldKey);

            if (key === '') {
                setDebouncedKeyError(undefined);

                return;
            }

            if (!FIELD_KEY_PATTERN.test(key)) {
                setDebouncedKeyError(
                    'Use lowercase letters, numbers, and hyphens (e.g. my-field).',
                );

                return;
            }

            if (siblingFieldNames.includes(key)) {
                setDebouncedKeyError(
                    'A field with this key already exists in this collection.',
                );

                return;
            }

            setDebouncedKeyError(undefined);
        }, 350);

        return () => window.clearTimeout(handle);
    }, [fieldKey, siblingFieldNames]);

    return debouncedKeyError;
}
