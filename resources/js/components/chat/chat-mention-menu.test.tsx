import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

import { ChatMentionHitLabel } from '@/components/chat/chat-mention-hit';
import type { ChatMentionHit } from '@/components/chat/chat-mention-hit';
import {
    ChatMentionMenu,
    handleMentionMenuKeyDown,
} from '@/components/chat/chat-mention-menu';

const hits: ChatMentionHit[] = [
    { type: 'user', id: 1, name: 'Bruno Test', email: 'bruno@example.test' },
    { type: 'collection', id: 4, name: 'Journal' },
];

function keyEvent(key: string, init: Partial<KeyboardEvent> = {}) {
    return {
        key,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        preventDefault: vi.fn(),
        ...init,
    } as unknown as KeyboardEvent<HTMLTextAreaElement>;
}

function menu(
    overrides: Partial<Parameters<typeof handleMentionMenuKeyDown>[1]> = {},
) {
    return {
        isOpen: true,
        hits,
        highlightIndex: 0,
        onHighlightChange: vi.fn(),
        onPick: vi.fn(),
        onDismiss: vi.fn(),
        ...overrides,
    };
}

describe('handleMentionMenuKeyDown', () => {
    it('moves the highlight with the arrows, wrapping around', () => {
        const state = menu();
        const up = keyEvent('ArrowUp');

        expect(handleMentionMenuKeyDown(up, state)).toBe(true);
        expect(up.preventDefault).toHaveBeenCalled();
        expect(state.onHighlightChange).toHaveBeenCalledWith(1);
    });

    it('picks the highlighted hit on Enter instead of sending', () => {
        const state = menu({ highlightIndex: 1 });
        const enter = keyEvent('Enter');

        handleMentionMenuKeyDown(enter, state);

        expect(enter.preventDefault).toHaveBeenCalled();
        expect(state.onPick).toHaveBeenCalledWith(hits[1]);
    });

    it('closes on Escape', () => {
        const state = menu();

        handleMentionMenuKeyDown(keyEvent('Escape'), state);

        expect(state.onDismiss).toHaveBeenCalled();
    });

    it('leaves keys alone while closed or for Shift+Enter', () => {
        const closed = keyEvent('Enter');
        const shiftEnter = keyEvent('Enter', { shiftKey: true });

        expect(handleMentionMenuKeyDown(closed, menu({ isOpen: false }))).toBe(
            false,
        );
        expect(handleMentionMenuKeyDown(shiftEnter, menu())).toBe(false);
        expect(closed.preventDefault).not.toHaveBeenCalled();
        expect(shiftEnter.preventDefault).not.toHaveBeenCalled();
    });
});

describe('ChatMentionMenu', () => {
    // Radix popper and cmdk measure and scroll; jsdom has neither API.
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        },
    );
    Element.prototype.scrollIntoView = vi.fn();

    afterEach(() => {
        cleanup();
    });

    it('lists the hits as listbox options and picks one on click', () => {
        const onPick = vi.fn();

        render(
            <ChatMentionMenu
                open
                hits={hits}
                highlightIndex={0}
                onHighlightChange={vi.fn()}
                onPick={onPick}
                renderHit={(hit) => <ChatMentionHitLabel hit={hit} />}
                onDismiss={vi.fn()}
            >
                <textarea aria-label="Message" />
            </ChatMentionMenu>,
        );

        expect(
            screen.getByRole('listbox', {
                name: 'collections.itemChat.mention',
            }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(2);
        expect(
            screen.getByText('collections.itemChat.mentionCollection'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText('Bruno Test'));

        expect(onPick).toHaveBeenCalledWith(hits[0]);
    });

    it('renders nothing over the composer without hits', () => {
        render(
            <ChatMentionMenu
                open
                hits={[]}
                highlightIndex={0}
                onHighlightChange={vi.fn()}
                onPick={vi.fn()}
                renderHit={(hit) => <ChatMentionHitLabel hit={hit} />}
                onDismiss={vi.fn()}
            >
                <textarea aria-label="Message" />
            </ChatMentionMenu>,
        );

        expect(screen.queryByRole('listbox')).toBeNull();
    });
});
