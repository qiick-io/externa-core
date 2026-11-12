import { act, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';

type Handler = (payload: never) => void;

const mocks = vi.hoisted(() => ({
    ensureEcho: vi.fn(),
    markChatRead: vi.fn(),
}));

vi.mock('@/lib/echo', () => ({ ensureEcho: mocks.ensureEcho }));

vi.mock('@/lib/item-chat-api', () => ({ markChatRead: mocks.markChatRead }));

import { useChatRealtime } from '@/components/collections/item-chat/use-chat-realtime';
import type { ItemChatMessage } from '@/lib/item-chat-api';
import { resetChatStore } from '@/stores/chat/reset';
import { useChatStore } from '@/stores/chat/store';

/** Minimal stand-in for Laravel Echo's presence channel, as `online-presence.test.ts` does. */
function mockEcho() {
    const listeners = new Map<string, Handler>();
    const whispers = new Map<string, Handler>();
    const channel = {
        listen: vi.fn((event: string, handler: Handler) => {
            listeners.set(event, handler);

            return channel;
        }),
        listenForWhisper: vi.fn((event: string, handler: Handler) => {
            whispers.set(event, handler);

            return channel;
        }),
        whisper: vi.fn(),
    };
    const echo = {
        join: vi.fn(() => channel),
        leave: vi.fn(),
    };

    return {
        echo,
        channel,
        emit: (event: string, payload: unknown) =>
            listeners.get(event)?.(payload as never),
        whisperFrom: (payload: unknown) =>
            whispers.get('typing')?.(payload as never),
    };
}

function message(overrides: Partial<ItemChatMessage> = {}): ItemChatMessage {
    return {
        id: 1,
        body: 'Hello',
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
        ...overrides,
    };
}

function renderRealtime(
    overrides: Partial<Parameters<typeof useChatRealtime>[0]> = {},
) {
    const options = {
        open: true,
        realtimeOn: true,
        liveChatId: 'chat-1',
        scope: { mode: 'hub', chatId: 'chat-1' } as const,
        scopeKey: 'hub:chat-1',
        viewerId: 1,
        viewerName: 'Viewer',
        messages: [] as ItemChatMessage[],
        liveChatIdRef: { current: 'chat-1' as string | null },
        chatCountRef: { current: 3 },
        onChatCountChangeRef: { current: vi.fn() },
        forceScrollBottomRef: { current: false },
        dropEchoedPending: vi.fn(),
        ...overrides,
    };

    return { options, ...renderHook(() => useChatRealtime(options)) };
}

describe('useChatRealtime', () => {
    let fake: ReturnType<typeof mockEcho>;

    beforeEach(() => {
        resetChatStore();
        // Echo events only update a thread whose first page is already cached.
        useChatStore.getState().setMessagesCache('chat-1', {
            messages: [],
            hasMore: false,
            pinned: [],
        });
        fake = mockEcho();
        mocks.ensureEcho.mockReturnValue(fake.echo);
        mocks.markChatRead.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('joins the chat presence channel and leaves it on unmount', () => {
        const { unmount } = renderRealtime();

        expect(fake.echo.join).toHaveBeenCalledWith('chat.chat-1');
        expect(fake.channel.listen.mock.calls.map(([event]) => event)).toEqual([
            '.MessageCreated',
            '.MessageUpdated',
            '.MessageDeleted',
            '.ReactionToggled',
        ]);

        unmount();

        expect(fake.echo.leave).toHaveBeenCalledWith('chat.chat-1');
    });

    it('does not subscribe without realtime or a chat id', () => {
        renderRealtime({ realtimeOn: false });
        renderRealtime({ liveChatId: null });

        expect(mocks.ensureEcho).not.toHaveBeenCalled();
    });

    it('appends a new message from someone else and marks the thread read', () => {
        const { options } = renderRealtime();

        act(() => {
            fake.emit('.MessageCreated', { message: message() });
        });

        expect(
            useChatStore.getState().messagesByChatId['chat-1']?.messages,
        ).toEqual([message()]);
        expect(options.onChatCountChangeRef.current).toHaveBeenCalledWith(1);
        expect(options.dropEchoedPending).not.toHaveBeenCalled();
        expect(mocks.markChatRead).toHaveBeenCalledWith(options.scope);
    });

    it('drops the matching pending bubble when its own message echoes back', () => {
        const { options } = renderRealtime();
        const own = message({ user: { id: 1, name: 'Viewer' } });

        act(() => {
            fake.emit('.MessageCreated', { message: own });
        });

        expect(options.dropEchoedPending).toHaveBeenCalledWith(own);
        expect(options.forceScrollBottomRef.current).toBe(true);
    });

    it('removes a deleted message and lowers the count', () => {
        const { options } = renderRealtime();

        act(() => {
            fake.emit('.MessageCreated', { message: message() });
            fake.emit('.MessageDeleted', { id: 1 });
        });

        expect(
            useChatStore.getState().messagesByChatId['chat-1']?.messages,
        ).toEqual([]);
        expect(options.onChatCountChangeRef.current).toHaveBeenLastCalledWith(
            2,
        );
    });

    it('shows who is typing and expires them after a few seconds', () => {
        vi.useFakeTimers();
        const { result } = renderRealtime();

        act(() => {
            fake.whisperFrom({ userId: 1, name: 'Viewer' });
            fake.whisperFrom({ userId: 2, name: 'Ada' });
        });

        expect(result.current.typingNames).toEqual(['Ada']);

        act(() => {
            vi.advanceTimersByTime(3100);
        });

        expect(result.current.typingNames).toEqual([]);
    });

    it('throttles typing whispers to one every 500 ms', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
        const { result } = renderRealtime();

        act(() => {
            result.current.whisperTyping();
            result.current.whisperTyping();
        });

        expect(fake.channel.whisper).toHaveBeenCalledTimes(1);
        expect(fake.channel.whisper).toHaveBeenCalledWith('typing', {
            userId: 1,
            name: 'Viewer',
        });

        vi.setSystemTime(new Date('2026-11-12T10:00:01Z'));

        act(() => {
            result.current.whisperTyping();
        });

        expect(fake.channel.whisper).toHaveBeenCalledTimes(2);
    });
});
