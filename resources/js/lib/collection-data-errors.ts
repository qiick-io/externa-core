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
