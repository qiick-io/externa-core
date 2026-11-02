/**
 * Shared fetch helpers for JSON APIs that return Laravel-style error payloads.
 */

type LaravelErrorPayload = {
    message?: string;
    errors?: Record<string, string[]>;
};

/**
 * Parses a Laravel JSON error body into a single human-readable message.
 *
 * Prefers `message`, then the first validation error, otherwise `fallback`.
 *
 * @param response - Failed fetch response
 * @param fallback - Message when the body is missing or non-JSON
 * @returns Error message string
 */
export async function parseError(
    response: Response,
    fallback: string,
): Promise<string> {
    try {
        const payload = (await response.json()) as LaravelErrorPayload;

        if (payload.message) {
            return payload.message;
        }

        const first = Object.values(payload.errors ?? {})[0]?.[0];

        if (first) {
            return first;
        }
    } catch {
        /* Non-JSON error body — use fallback */
    }

    return fallback;
}

/**
 * Throws when `response` is not OK, using {@link parseError} for the message.
 *
 * @param response - Fetch response
 * @param fallback - Fallback error message
 * @throws {Error} When `response.ok` is false
 */
export async function assertOk(
    response: Response,
    fallback: string,
): Promise<void> {
    if (!response.ok) {
        throw new Error(await parseError(response, fallback));
    }
}

/**
 * Fetches a URL, asserts OK, and parses the JSON body.
 *
 * @param input - Request URL or Request
 * @param init - Fetch init
 * @param fallback - Error message when the response is not OK
 * @returns Parsed JSON body as `T`
 * @throws {Error} When the response is not OK
 */
export async function requestJson<T>(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    fallback: string,
): Promise<T> {
    const response = await fetch(input, init);

    await assertOk(response, fallback);

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}
