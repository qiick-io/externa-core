/**
 * Collects user-facing validation messages for collection item `data` payloads from Inertia form errors.
 * Supports flat keys (`data.title`), dot paths, and nested `errors.data` objects.
 *
 * @param errors - Inertia validation errors object
 * @returns De-duplicated list of message strings
 */
export function collectCollectionDataErrorMessages(
    errors: Record<string, unknown> | undefined,
): string[] {
    if (!errors || typeof errors !== 'object') {
        return [];
    }

    const messages: string[] = [];

    const pushString = (value: unknown): void => {
        if (typeof value === 'string' && value.trim() !== '') {
            messages.push(value);
        }
    };

    const walk = (obj: unknown, path: string): void => {
        if (obj === null || obj === undefined) {
            return;
        }

        if (typeof obj === 'string') {
            if (path.startsWith('data') || path === '') {
                pushString(obj);
            }

            return;
        }

        if (Array.isArray(obj)) {
            for (const [index, item] of obj.entries()) {
                walk(item, `${path}[${index}]`);
            }

            return;
        }

        if (typeof obj === 'object') {
            for (const [key, nestedValue] of Object.entries(obj)) {
                const nextPath = path === '' ? key : `${path}.${key}`;
                walk(nestedValue, nextPath);
            }
        }
    };

    for (const [key, value] of Object.entries(errors)) {
        if (key === 'data') {
            walk(value, 'data');
            continue;
        }

        if (key.startsWith('data.')) {
            pushString(value);
        }
    }

    return [...new Set(messages)];
}

/**
 * Extracts field-specific error message for a given field name from Inertia errors.
 * Handles both non-translatable (data.field) and translatable (data.field.locale) patterns.
 *
 * @param errors - Inertia validation errors object
 * @param fieldName - The field name (without data. prefix)
 * @returns First error message for this field or undefined
 */
export function getFieldError(
    errors: Record<string, unknown> | undefined,
    fieldName: string,
): string | undefined {
    if (!errors || typeof errors !== 'object') {
        return undefined;
    }

    const dataKey = `data.${fieldName}`;
    if (typeof errors[dataKey] === 'string') {
        return errors[dataKey] as string;
    }

    const dataPattern = new RegExp(`^data\\.${fieldName.replace('.', '\\.')}(\\.|$)`);
    for (const [key, value] of Object.entries(errors)) {
        if (dataPattern.test(key) && typeof value === 'string') {
            return value;
        }
    }

    return undefined;
}

/**
 * Extracts non-field errors (errors not related to data.* fields).
 *
 * @param errors - Inertia validation errors object
 * @returns Array of non-field error messages
 */
export function getNonFieldErrors(
    errors: Record<string, unknown> | undefined,
): string[] {
    if (!errors || typeof errors !== 'object') {
        return [];
    }

    const messages: string[] = [];
    for (const [key, value] of Object.entries(errors)) {
        if (!key.startsWith('data') && !key.startsWith('data.')) {
            if (typeof value === 'string' && value.trim() !== '') {
                messages.push(value);
            }
        }
    }

    return messages;
}
