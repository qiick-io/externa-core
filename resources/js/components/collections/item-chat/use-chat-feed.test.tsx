import { act, renderHook, waitFor } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
    fetchMessages: vi.fn(),
    markChatRead: vi.fn(),
    stopChatViewing: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/item-chat-api', () => ({
    fetchMessages: mocks.fetchMessages,
    markChatRead: mocks.markChatRead,
    stopChatViewing: mocks.stopChatViewing,
}));

import { useChatFeed } from '@/components/collections/item-chat/use-chat-feed';
import type { ItemChatMessage } from '@/lib/item-chat-api';
import { resetChatStore } from '@/stores/chat/reset';

function message(id: number): ItemChatMessage {
    return {
        id,
        body: `Message ${id}`,
        mentioned_user_ids: [],
        mentioned_users: [],
        user: { id: 2, name: 'Ada' },
        attachments: [],
        reply_to: null,
        is_pinned: false,
        pinned_at: null,
        reactions: [],
        created_at: '2026-11-12T10:00:00Z',
        updated_at: null,
        can_edit: false,
        can_delete: false,
    };
}

function page(messages: ItemChatMessage[], hasMore = false) {
    return {
        messages,
        pinned: [],
        meta: {
            total: messages.length,
            has_more: hasMore,
            per_page: 30,
            notify: true,
            chat_id: 'chat-1',
        },
    };
}

function renderFeed(variant: 'drawer' | 'pane' = 'drawer') {
    const options = {
        open: true,
        collectionId: 4,
        itemId: 9,
        chatId: null,
        variant,
        liveChatIdRef: { current: null as string | null },
        onChatCountChangeRef: { current: vi.fn() },
        olderAnchorIdRef: { current: null as number | null },
    };

    return { options, ...renderHook(() => useChatFeed(options)) };
}

describe('useChatFeed', () => {
    beforeEach(() => {
        resetChatStore();
        mocks.markChatRead.mockResolvedValue(undefined);
        mocks.stopChatViewing.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('loads the item thread, switches to its chat id and marks it read', async () => {
        mocks.fetchMessages.mockResolvedValue(page([message(1), message(2)]));
        const { options, result, unmount } = renderFeed();

        expect(mocks.fetchMessages).toHaveBeenCalledWith(
            { mode: 'item', collectionId: 4, itemId: 9 },
            { beforeId: undefined },
        );
        expect(mocks.markChatRead).toHaveBeenCalledWith({
            mode: 'item',
            collectionId: 4,
            itemId: 9,
        });

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(2);
        });
        expect(result.current.liveChatId).toBe('chat-1');
        expect(result.current.scopeKey).toBe('hub:chat-1');
        expect(result.current.notify).toBe(true);
        expect(result.current.loading).toBe(false);
        expect(options.onChatCountChangeRef.current).toHaveBeenCalledWith(2);

        unmount();

        expect(mocks.stopChatViewing).toHaveBeenLastCalledWith({
            mode: 'hub',
            chatId: 'chat-1',
        });
    });

    it('leaves marking read to the hub page in the pane variant', () => {
        mocks.fetchMessages.mockResolvedValue(page([]));
        renderFeed('pane');

        expect(mocks.markChatRead).not.toHaveBeenCalled();
    });

    it('prepends older messages and remembers the anchor', async () => {
        mocks.fetchMessages.mockResolvedValueOnce(
            page([message(5), message(6)], true),
        );
        const { options, result } = renderFeed();

        await waitFor(() => {
            expect(result.current.hasMore).toBe(true);
        });

        mocks.fetchMessages.mockResolvedValueOnce(page([message(4)], false));

        act(() => {
            result.current.loadOlder();
        });

        expect(options.olderAnchorIdRef.current).toBe(5);
        expect(mocks.fetchMessages).toHaveBeenLastCalledWith(
            { mode: 'hub', chatId: 'chat-1' },
            { beforeId: 5 },
        );
        await waitFor(() => {
            expect(result.current.messages.map((row) => row.id)).toEqual([
                4, 5, 6,
            ]);
        });
        expect(result.current.hasMore).toBe(false);
    });

    it('shows the error when the first page fails', async () => {
        mocks.fetchMessages.mockRejectedValue(new Error('offline'));
        const { result } = renderFeed();

        await waitFor(() => {
            expect(result.current.error).toBe('collections.itemChat.error');
        });
        expect(result.current.loading).toBe(false);
    });

    it('follows a new chat id prop and loads that thread', async () => {
        mocks.fetchMessages.mockResolvedValue(page([]));
        const { result, rerender } = renderHook(
            ({ chatId }: { chatId: string | null }) =>
                useChatFeed({
                    open: true,
                    chatId,
                    variant: 'pane',
                    liveChatIdRef: { current: null },
                    onChatCountChangeRef: { current: vi.fn() },
                    olderAnchorIdRef: { current: null },
                }),
            { initialProps: { chatId: 'chat-1' as string | null } },
        );

        expect(result.current.scopeKey).toBe('hub:chat-1');

        rerender({ chatId: 'chat-2' });

        expect(result.current.liveChatId).toBe('chat-2');
        expect(result.current.scopeKey).toBe('hub:chat-2');
        await waitFor(() => {
            expect(mocks.fetchMessages).toHaveBeenLastCalledWith(
                { mode: 'hub', chatId: 'chat-2' },
                { beforeId: undefined },
            );
        });
    });
});
