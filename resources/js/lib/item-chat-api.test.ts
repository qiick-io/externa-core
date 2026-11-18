import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@/lib/echo', () => ({
    echoSocketIdHeaders: () => ({ 'X-Socket-ID': '1234.5678' }),
}));

import { toggleReaction } from '@/lib/item-chat-api';

describe('toggleReaction', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends this tab's socket id so the server skips its own echo", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                message_id: 1,
                emoji: '👍',
                added: true,
                reactions: [],
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await toggleReaction({ mode: 'hub', chatId: 'chat-1' }, 1, '👍');

        expect(fetchMock).toHaveBeenCalledWith(
            '/chat/chat-1/messages/1/reactions',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'X-Socket-ID': '1234.5678',
                }),
            }),
        );
    });
});
