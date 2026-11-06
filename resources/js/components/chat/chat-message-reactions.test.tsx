import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) =>
            options ? `${key}:${Object.values(options).join('|')}` : key,
    }),
}));

import { ChatMessageReactions } from '@/components/chat/chat-message-reactions';

const users = ['Alice', 'Bruno', 'Carla', 'Dario'].map((name, index) => ({
    id: index + 1,
    name,
}));

describe('ChatMessageReactions', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders one toggle per emoji with the reactors and toggles it', () => {
        const onToggle = vi.fn();

        render(
            <ChatMessageReactions
                align="end"
                onToggle={onToggle}
                reactions={[
                    {
                        emoji: '👍',
                        count: 4,
                        reacted: true,
                        users: users as never,
                    },
                ]}
            />,
        );

        const toggle = screen.getByRole('button', {
            name: 'collections.itemChat.reactionToggle:👍|Alice, Bruno, Carla, Dario',
        });

        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('+1')).toBeInTheDocument();

        fireEvent.click(toggle);

        expect(onToggle).toHaveBeenCalledWith('👍');
    });

    it('renders nothing without reactions', () => {
        const { container } = render(
            <ChatMessageReactions
                align="start"
                onToggle={vi.fn()}
                reactions={[]}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });
});
