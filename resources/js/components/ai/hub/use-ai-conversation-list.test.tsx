import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import type { AiConversationSummary } from '@/lib/ai-chat';
import type { Paginated } from '@/types/admin';
import { useAiConversationList } from './use-ai-conversation-list';

const mocks = vi.hoisted(() => ({
    fetchAiConversationsPage: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/i18n', () => ({
    default: { t: (key: string) => key },
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: mocks.toastError },
}));

vi.mock('@/lib/ai-chat', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    fetchAiConversationsPage: mocks.fetchAiConversationsPage,
}));

const today = new Date().toISOString();

function conversation(
    id: string,
    pinnedAt: string | null = null,
): AiConversationSummary {
    return { id, title: `Chat ${id}`, pinned_at: pinnedAt, updated_at: today };
}

function page(
    conversations: AiConversationSummary[],
    currentPage = 1,
    lastPage = 1,
): Paginated<AiConversationSummary> {
    return {
        data: conversations,
        current_page: currentPage,
        last_page: lastPage,
        per_page: 25,
        total: conversations.length,
    } as Paginated<AiConversationSummary>;
}

function shiftPointer(): ReactPointerEvent {
    return {
        shiftKey: true,
        preventDefault: vi.fn(),
    } as unknown as ReactPointerEvent;
}

describe('useAiConversationList', () => {
    beforeEach(() => {
        mocks.fetchAiConversationsPage.mockReset();
        mocks.toastError.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('groups pinned chats first and indexes rows in display order', () => {
        const { result } = renderHook(() =>
            useAiConversationList(
                page([conversation('a'), conversation('b', today)]),
            ),
        );

        expect(
            result.current.conversationSections.map((section) => section.key),
        ).toEqual(['pinned', 'today']);
        expect(result.current.conversationIndexById.get('b')).toBe(0);
        expect(result.current.conversationIndexById.get('a')).toBe(1);
    });

    it('selects a range on shift-click and drops removed rows', () => {
        const { result } = renderHook(() =>
            useAiConversationList(
                page([conversation('a'), conversation('b'), conversation('c')]),
            ),
        );

        act(() => {
            result.current.toggleSelected('a', true, 0);
        });

        act(() => {
            result.current.handleCheckboxPointerDown(shiftPointer(), 2);
        });

        expect([...result.current.selectedIds]).toEqual(['a', 'b', 'c']);

        act(() => {
            result.current.removeConversationsFromSidebar(['b']);
        });

        expect([...result.current.selectedIds]).toEqual(['a', 'c']);
        expect(result.current.conversationItems.map((item) => item.id)).toEqual(
            ['a', 'c'],
        );
    });

    it('keeps optimistic removals when the prop changes identity only', () => {
        const rows = [conversation('a'), conversation('b')];
        const { result, rerender } = renderHook(
            ({ conversations }) => useAiConversationList(conversations),
            { initialProps: { conversations: page(rows) } },
        );

        act(() => {
            result.current.removeConversationsFromSidebar(['a']);
        });

        rerender({ conversations: page([...rows]) });

        expect(result.current.conversationItems.map((item) => item.id)).toEqual(
            ['b'],
        );

        rerender({ conversations: page([conversation('c')]) });

        expect(result.current.conversationItems.map((item) => item.id)).toEqual(
            ['c'],
        );
    });

    it('searches on the server after a debounce', async () => {
        vi.useFakeTimers();
        mocks.fetchAiConversationsPage.mockResolvedValue(
            page([conversation('match')]),
        );
        const { result } = renderHook(() =>
            useAiConversationList(page([conversation('a')])),
        );

        act(() => {
            result.current.setConversationQuery(' report ');
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        expect(mocks.fetchAiConversationsPage).toHaveBeenCalledWith(
            1,
            25,
            'report',
        );
        expect(result.current.conversationItems.map((item) => item.id)).toEqual(
            ['match'],
        );
    });

    it('appends the next page without duplicates', async () => {
        mocks.fetchAiConversationsPage.mockResolvedValue(
            page([conversation('b'), conversation('c')], 2, 2),
        );
        const { result } = renderHook(() =>
            useAiConversationList(
                page([conversation('a'), conversation('b')], 1, 2),
            ),
        );

        expect(result.current.hasMoreConversations).toBe(true);

        await act(async () => {
            await result.current.handleLoadMoreConversations();
        });

        expect(mocks.fetchAiConversationsPage).toHaveBeenCalledWith(2, 25, '');
        expect(result.current.conversationItems.map((item) => item.id)).toEqual(
            ['a', 'b', 'c'],
        );
        expect(result.current.hasMoreConversations).toBe(false);
    });
});
