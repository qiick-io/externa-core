import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) =>
            options ? `${key}:${Object.values(options).join('|')}` : key,
    }),
}));

import { ChatMessageReactions } from '@/components/chat/chat-message-reactions';
import { TooltipProvider } from '@/components/ui/tooltip';

const users = ['Alice', 'Bruno', 'Carla', 'Dario'].map((name, index) => ({
    id: index + 1,
    name,
}));

describe('ChatMessageReactions', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders one button per emoji with its count and toggles it', () => {
        const onToggle = vi.fn();

        render(
            <TooltipProvider>
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
                />
            </TooltipProvider>,
        );

        const toggle = screen.getByRole('button', {
            name: 'collections.itemChat.reactionToggle:👍|Alice, Bruno, Carla, Dario',
        });

        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(toggle).toHaveTextContent('👍4');

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
