import ItemAiDraftController from '@/actions/App/Http/Controllers/Collections/ItemAiDraftController';
import { jsonRequestHeaders } from '@/lib/csrf';
import {
    readFieldRawFromForm,
    withLocaleSlice,
} from '@/lib/item-field-raw-value';
import type { FieldDef } from '@/types';

export type ItemAiDraftValue = string | string[];

export type ItemAiDraftResponse = {
    data: Record<string, ItemAiDraftValue>;
    dropped: { field: string; reason: string }[];
};

/**
 * Ask the server for a schema-aware AI draft of the item fields (#210).
 * Nothing is saved: the caller previews the values and fills the unsaved form.
 */
export async function requestItemAiDraft(
    collectionId: number,
    payload: { prompt: string; locale: string },
    signal?: AbortSignal,
): Promise<ItemAiDraftResponse> {
    const response = await fetch(ItemAiDraftController.url(collectionId), {
        method: 'POST',
        headers: { ...jsonRequestHeaders(), Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) {
        let detail: string | null = null;

        try {
            const body = (await response.json()) as {
                message?: string;
                errors?: Record<string, string[]>;
            };
            detail =
                Object.values(body.errors ?? {})[0]?.[0] ??
                body.message ??
                null;
        } catch {
            detail = null;
        }

        throw new Error(detail ?? `HTTP ${response.status}`);
    }

    return (await response.json()) as ItemAiDraftResponse;
}

/**
 * Shape draft values for the item form: translatable fields keep the other
 * locales already in the (unsaved) form and only replace the drafted locale.
 */
export function draftValuesForForm(
    fields: FieldDef[],
    draft: Record<string, ItemAiDraftValue>,
    locale: string,
    locales: string[],
    form: HTMLFormElement | null,
): Record<string, unknown> {
    const formValues: Record<string, unknown> = {};

    for (const [fieldName, value] of Object.entries(draft)) {
        const field = fields.find((candidate) => candidate.name === fieldName);

        if (!field) {
            continue;
        }

        if (!field.translatable) {
            formValues[fieldName] = value;

            continue;
        }

        const currentLocaleValues: Record<string, unknown> = {};

        for (const code of locales) {
            const current = form
                ? readFieldRawFromForm(form, fieldName, code)
                : undefined;

            if (current !== undefined) {
                currentLocaleValues[code] = current;
            }
        }

        formValues[fieldName] = withLocaleSlice(
            currentLocaleValues,
            locale,
            value,
        );
    }

    return formValues;
}
