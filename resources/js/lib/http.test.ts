import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOk, parseError, requestJson } from './http';

describe('parseError', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prefers message over validation errors', async () => {
        const response = new Response(
            JSON.stringify({
                message: 'Nope',
                errors: { name: ['Required'] },
            }),
            { status: 422 },
        );

        await expect(parseError(response, 'fallback')).resolves.toBe('Nope');
    });

    it('falls back to the first validation error', async () => {
        const response = new Response(
            JSON.stringify({ errors: { name: ['Required'] } }),
            { status: 422 },
        );

        await expect(parseError(response, 'fallback')).resolves.toBe(
            'Required',
        );
    });

    it('returns the fallback for non-JSON bodies', async () => {
        const response = new Response('plain', { status: 500 });

        await expect(parseError(response, 'fallback')).resolves.toBe(
            'fallback',
        );
    });
});

describe('assertOk', () => {
    it('resolves when the response is OK', async () => {
        await expect(
            assertOk(new Response(null, { status: 204 }), 'fallback'),
        ).resolves.toBeUndefined();
    });

    it('throws with a parsed message when not OK', async () => {
        const response = new Response(JSON.stringify({ message: 'Denied' }), {
            status: 403,
        });

        await expect(assertOk(response, 'fallback')).rejects.toThrow('Denied');
    });
});

describe('requestJson', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns parsed JSON for successful responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ id: 1 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            ),
        );

        await expect(
            requestJson<{ id: number }>('/x', undefined, 'fallback'),
        ).resolves.toEqual({ id: 1 });
    });

    it('throws when the response is not OK', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ message: 'Boom' }), {
                    status: 500,
                }),
            ),
        );

        await expect(requestJson('/x', undefined, 'fallback')).rejects.toThrow(
            'Boom',
        );
    });
});
