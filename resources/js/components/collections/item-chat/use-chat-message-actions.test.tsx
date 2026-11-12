import { act, renderHook, waitFor } from '@testing-library/react';
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
    deleteMessage: vi.fn(),
    patchMessage: vi.fn(),
    pinMessage: vi.fn(),
    toggleReaction: vi.fn(),
    markChatRead: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/echo', () => ({ ensureEcho: mocks.ensureEcho }));

vi.mock('@/lib/item-chat-api', () => ({
    deleteMessage: mocks.deleteMessage,
    patchMessage: mocks.patchMessage,
    pinMessage: mocks.pinMessage,
    toggleReaction: mocks.toggleReaction,
    markChatRead: mocks.markChatRead,
}));

import { useChatMessageActions } from '@/components/collections/item-chat/use-chat-message-actions';
import { useChatRealtime } from '@/components/collections/item-chat/use-chat-realtime';
import type { ItemChatMessage } from '@/lib/item-chat-api';
import { resetChatStore } from '@/stores/chat/reset';
import { useChatStore } from '@/stores/chat/store';

const scope = { mode: 'hub', chatId: 'chat-1' } as const;

function message(overrides: Partial<ItemChatMessage> = {}): ItemChatMessage {
    return {
        id: 1,
        body: 'Hello',
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
        ...overrides,
    };
}

/** Presence channel stand-in that lets a test emit Echo events. */
function mockEcho() {
    const listeners = new Map<string, Handler>();
    const channel = {
        listen: vi.fn((event: string, handler: Handler) => {
            listeners.set(event, handler);

            return channel;
        }),
        listenForWhisper: vi.fn(() => channel),
        whisper: vi.fn(),
    };

    return {
        echo: { join: vi.fn(() => channel), leave: vi.fn() },
        emit: (event: string, payload: unknown) =>
            listeners.get(event)?.(payload as never),
    };
}

/** Shared drawer refs, as `item-chat-drawer.tsx` passes them to both hooks. */
function drawerRefs(chatCount: number) {
    return {
        liveChatIdRef: { current: 'chat-1' as string | null },
        chatCountRef: { current: chatCount },
        countedDeletionIdsRef: { current: new Set<number>() },
        onChatCountChangeRef: { current: vi.fn() },
    };
}

function actionsOptions(
    refs: ReturnType<typeof drawerRefs>,
    overrides: Partial<Parameters<typeof useChatMessageActions>[0]> = {},
) {
    return {
        open: true,
        scope,
        scopeKey: 'hub:chat-1',
        viewerId: 1,
        viewerName: 'Viewer',
        ...refs,
        textareaRef: { current: null },
        setReplyTo: vi.fn(),
        setError: vi.fn(),
        load: vi.fn(),
        ...overrides,
    } as Parameters<typeof useChatMessageActions>[0];
}

/** Both hooks of one drawer, sharing its refs, with realtime on. */
function renderDrawerHooks(refs: ReturnType<typeof drawerRefs>) {
    return renderHook(() => {
        useChatRealtime({
            open: true,
            realtimeOn: true,
            liveChatId: 'chat-1',
            scope,
            scopeKey: 'hub:chat-1',
            viewerId: 1,
            viewerName: 'Viewer',
            messages: [],
            ...refs,
            forceScrollBottomRef: { current: false },
            dropEchoedPending: vi.fn(),
        });

        return useChatMessageActions(actionsOptions(refs));
    });
}

describe('useChatMessageActions', () => {
    let fake: ReturnType<typeof mockEcho>;

    beforeEach(() => {
        resetChatStore();
        useChatStore.getState().setMessagesCache('chat-1', {
            messages: [message()],
            hasMore: false,
            pinned: [],
        });
        fake = mockEcho();
        mocks.ensureEcho.mockReturnValue(fake.echo);
        mocks.deleteMessage.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('lowers the count once when the delete reply comes before its echo', async () => {
        const refs = drawerRefs(5);
        const { result } = renderDrawerHooks(refs);

        act(() => {
            result.current.removeMessage(message());
        });

        await waitFor(() => {
            expect(refs.onChatCountChangeRef.current).toHaveBeenCalledWith(4);
        });

        act(() => {
            fake.emit('.MessageDeleted', { id: 1 });
        });

        expect(refs.onChatCountChangeRef.current).toHaveBeenCalledTimes(1);
        expect(
            useChatStore.getState().messagesByChatId['chat-1']?.messages,
        ).toEqual([]);
    });

    it('lowers the count once when the echo comes before the delete reply', async () => {
        const refs = drawerRefs(5);
        let resolveDelete: () => void = () => undefined;
        mocks.deleteMessage.mockReturnValue(
            new Promise<void>((resolve) => {
                resolveDelete = resolve;
            }),
        );
        const { result } = renderDrawerHooks(refs);

        act(() => {
            result.current.removeMessage(message());
            fake.emit('.MessageDeleted', { id: 1 });
        });

        expect(refs.onChatCountChangeRef.current).toHaveBeenCalledWith(4);

        await act(async () => {
            resolveDelete();
            await Promise.resolve();
        });

        expect(refs.onChatCountChangeRef.current).toHaveBeenCalledTimes(1);
    });

    it('does not save an edit without a thread scope', () => {
        const refs = drawerRefs(1);
        const { result } = renderHook(() =>
            useChatMessageActions(actionsOptions(refs, { scope: null })),
        );

        expect(() => result.current.saveEdit(message())).not.toThrow();
        expect(mocks.patchMessage).not.toHaveBeenCalled();
    });

    it('leaves edit mode when the drawer switches to another thread', () => {
        const refs = drawerRefs(1);
        const { result, rerender } = renderHook(
            ({ scopeKey }: { scopeKey: string }) =>
                useChatMessageActions(actionsOptions(refs, { scopeKey })),
            { initialProps: { scopeKey: 'hub:chat-1' } },
        );

        act(() => {
            result.current.messageActionsFor(message()).onEdit();
        });

        expect(result.current.editingId).toBe(1);

        rerender({ scopeKey: 'hub:chat-2' });

        expect(result.current.editingId).toBeNull();
    });
});
