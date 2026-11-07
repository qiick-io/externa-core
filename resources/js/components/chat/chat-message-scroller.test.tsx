import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

import { ChatMessageScroller } from '@/components/chat/chat-message-scroller';
import type { ChatMessageScrollerHandle } from '@/components/chat/chat-message-scroller';
import { MessageScrollerItem } from '@/components/ui/message-scroller';

describe('ChatMessageScroller', () => {
    afterEach(() => {
        cleanup();
    });

    it('keeps the empty state out of the message log', () => {
        render(
            <ChatMessageScroller empty={<p>No messages yet.</p>}>
                {null}
            </ChatMessageScroller>,
        );

        const log = screen.getByRole('log');

        expect(screen.getByText('No messages yet.')).toBeInTheDocument();
        expect(log).not.toContainElement(screen.getByText('No messages yet.'));
        expect(
            screen.getByRole('region', { name: 'chatHub.messagesRegion' }),
        ).toBeInTheDocument();
    });

    it('renders messages as scroller items and exposes the scroll API', () => {
        const scrollerRef = createRef<ChatMessageScrollerHandle>();

        render(
            <ChatMessageScroller scrollerRef={scrollerRef} label="Conversation">
                <MessageScrollerItem messageId="7">Hello</MessageScrollerItem>
            </ChatMessageScroller>,
        );

        expect(
            screen.getByRole('region', { name: 'Conversation' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Hello')).toHaveAttribute(
            'data-message-id',
            '7',
        );
        expect(scrollerRef.current?.scrollToMessage).toBeTypeOf('function');
        expect(scrollerRef.current?.scrollToEnd).toBeTypeOf('function');
    });

    it('shows the status overlay only when there is something to show', () => {
        const { rerender } = render(
            <ChatMessageScroller overlay={null}>{null}</ChatMessageScroller>,
        );

        expect(
            document.querySelector('[data-test="chat-thread-status"]'),
        ).toBeNull();

        rerender(
            <ChatMessageScroller overlay={<p>Bruno is typing…</p>}>
                {null}
            </ChatMessageScroller>,
        );

        expect(screen.getByText('Bruno is typing…')).toBeInTheDocument();
    });
});
