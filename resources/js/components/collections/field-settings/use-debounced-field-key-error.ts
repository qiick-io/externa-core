import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIELD_KEY_PATTERN, slugify } from '@/lib/slugify';

/**
 * Client-side check of the field key while the user types, 350 ms after the
 * last change: a key already used by a sibling field. The server validates
 * again on save; its error wins in the form.
 *
 * Only the key is debounced: the sibling check runs on render, so a parent
 * that passes a new `siblingFieldNames` array on every render does not
 * restart the timer. No format error is needed: the key is compared as its
 * slug, and `slugify` always returns an empty string or a valid field key.
 *
 * @returns The error message, or undefined while the key is empty or unique
 */
export function useDebouncedFieldKeyError(
    fieldKey: string,
    siblingFieldNames: string[],
): string | undefined {
    const { t } = useTranslation();
    const [debouncedFieldKey, setDebouncedFieldKey] = useState('');

    useEffect(() => {
        const handle = window.setTimeout(
            () => setDebouncedFieldKey(fieldKey),
            350,
        );

        return () => window.clearTimeout(handle);
    }, [fieldKey]);

    // Trailing `-` while typing → compare the finalized slug; leave legacy `_` keys alone.
    const key = FIELD_KEY_PATTERN.test(debouncedFieldKey)
        ? debouncedFieldKey
        : slugify(debouncedFieldKey);

    if (key !== '' && siblingFieldNames.includes(key)) {
        return t('collections.fieldSettings.form.keyDuplicate');
    }

    return undefined;
}
