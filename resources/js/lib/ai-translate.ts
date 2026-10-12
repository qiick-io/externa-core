import { jsonRequestHeaders } from '@/lib/csrf';

export type AiTranslateFieldsRequest = {
    source_locale: string;
    target_locale: string;
    fields: Record<string, string>;
};

export type AiTranslateFieldsResponse = {
    fields: Record<string, string>;
};

/**
 * Translate a map of field values via the AI translate-fields endpoint.
 */
export async function translateFieldsWithAi(
    payload: AiTranslateFieldsRequest,
    signal?: AbortSignal,
): Promise<AiTranslateFieldsResponse> {
    const response = await fetch('/ai/translate-fields', {
        method: 'POST',
        headers: {
            ...jsonRequestHeaders(),
            Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) {
        let detail = 'AI translation failed';

        try {
            const body = (await response.json()) as { message?: string };
            detail = body.message ?? detail;
        } catch {
            if (response.status === 504 || response.status === 502) {
                detail =
                    'AI translation timed out. Use a faster LOCAL_AI_TRANSLATE_MODEL or raise nginx fastcgi_read_timeout (Herd default ~60s).';
            }
        }

        throw new Error(detail);
    }

    return (await response.json()) as AiTranslateFieldsResponse;
}
