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
    postMessage: vi.fn(),
    uploadChatAttachment: vi.fn(),
    deleteChatAttachment: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/item-chat-api', () => ({
    postMessage: mocks.postMessage,
    uploadChatAttachment: mocks.uploadChatAttachment,
    deleteChatAttachment: mocks.deleteChatAttachment,
}));

import type { PendingChatMessage } from '@/components/chat/chat-outgoing-attach-preview';
import { useChatPendingMessages } from '@/components/collections/item-chat/use-chat-pending-messages';
import type { ItemChatMessage } from '@/lib/item-chat-api';
import { resetChatStore } from '@/stores/chat/reset';
import { useChatStore } from '@/stores/chat/store';

const scope = { mode: 'hub', chatId: 'chat-1' } as const;

function stored(body: string): ItemChatMessage {
    return {
        id: 10,
        body,
        mentioned_user_ids: [],
        mentioned_users: [],
        user: { id: 1, name: 'Viewer' },
        attachments: [],
        reply_to: null,
        is_pinned: false,
        pinned_at: null,
        reactions: [],
        created_at: '2026-11-12T10:00:00Z',
        updated_at: null,
        can_edit: true,
        can_delete: true,
    };
}

function pendingRow(body: string): PendingChatMessage {
    return {
        clientId: `pending-${body}`,
        status: 'sending',
        body,
        mentionedUsers: [],
        mentionedCollections: [],
        mentionedIds: [],
        replyTo: null,
        files: [],
        error: null,
    };
}

function renderPending(realtimeOn = true) {
    const options = {
        open: true,
        scope,
        scopeKey: 'hub:chat-1',
        realtimeOn,
        chatMaxUploadBytes: null,
        load: vi.fn(),
        liveChatIdRef: { current: 'chat-1' as string | null },
        chatCountRef: { current: 4 },
        onChatCountChangeRef: { current: vi.fn() },
        forceScrollBottomRef: { current: false },
    };

    return { options, ...renderHook(() => useChatPendingMessages(options)) };
}

describe('useChatPendingMessages', () => {
    beforeEach(() => {
        resetChatStore();
        useChatStore.getState().setMessagesCache('chat-1', {
            messages: [],
            hasMore: false,
            pinned: [],
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('posts a pending message and swaps it for the stored one', async () => {
        mocks.postMessage.mockResolvedValue(stored('Hello'));
        const { options, result } = renderPending();

        act(() => {
            result.current.enqueuePending(pendingRow('Hello'));
        });

        expect(result.current.pendingMessages).toHaveLength(1);
        expect(options.forceScrollBottomRef.current).toBe(true);
        expect(mocks.postMessage).toHaveBeenCalledWith(scope, {
            body: 'Hello',
            mentioned_user_ids: [],
            attachment_ids: [],
            reply_to_id: null,
        });

        await waitFor(() => {
            expect(result.current.pendingMessages).toHaveLength(0);
        });
        expect(
            useChatStore.getState().messagesByChatId['chat-1']?.messages,
        ).toEqual([stored('Hello')]);
        expect(options.onChatCountChangeRef.current).toHaveBeenCalledWith(5);
        expect(options.load).not.toHaveBeenCalled();
    });

    it('reloads the page after a send when realtime is off', async () => {
        mocks.postMessage.mockResolvedValue(stored('Hello'));
        const { options, result } = renderPending(false);

        act(() => {
            result.current.enqueuePending(pendingRow('Hello'));
        });

        await waitFor(() => {
            expect(options.load).toHaveBeenCalled();
        });
    });

    it('keeps a failed send with its error so it can be retried', async () => {
        mocks.postMessage.mockRejectedValueOnce(new Error('Server error'));
        const { result } = renderPending();

        act(() => {
            result.current.enqueuePending(pendingRow('Hello'));
        });

        await waitFor(() => {
            expect(result.current.pendingMessages[0]?.status).toBe('failed');
        });
        expect(result.current.pendingMessages[0]?.error).toBe('Server error');

        mocks.postMessage.mockResolvedValueOnce(stored('Hello'));

        act(() => {
            result.current.retryPending('pending-Hello');
        });

        await waitFor(() => {
            expect(result.current.pendingMessages).toHaveLength(0);
        });
    });

    it('drops only the pending row an own echo matches', () => {
        mocks.postMessage.mockReturnValue(new Promise(() => {}));
        const { result } = renderPending();

        act(() => {
            result.current.enqueuePending(pendingRow('First'));
            result.current.enqueuePending(pendingRow('Second'));
        });
        act(() => {
            result.current.dropEchoedPending(stored('Second'));
        });

        expect(result.current.pendingMessages.map((row) => row.body)).toEqual([
            'First',
        ]);
    });
});
