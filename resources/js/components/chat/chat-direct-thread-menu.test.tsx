import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ChatDirectThreadMenu } from './chat-direct-thread-menu';

const { deleteDirectChat } = vi.hoisted(() => ({
    deleteDirectChat: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@inertiajs/react', () => ({
    router: { visit: vi.fn(), reload: vi.fn() },
}));

vi.mock('@/components/chat/chat-users-drawer', () => ({
    ChatUsersDrawer: () => null,
    directoryKey: () => '',
}));

vi.mock('@/lib/chat-hub-api', () => ({
    addChatParticipants: vi.fn(),
    archiveDirectChat: vi.fn(),
    deleteDirectChat,
    unarchiveDirectChat: vi.fn(),
}));

afterEach(() => {
    cleanup();
    deleteDirectChat.mockClear();
});

async function chooseDeleteFromMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
        screen.getByRole('button', { name: 'collections.itemChat.more' }),
    );
    await user.click(
        await screen.findByRole('menuitem', { name: 'chatHub.deleteChat' }),
    );
}

describe('ChatDirectThreadMenu', () => {
    it('asks before deleting the chat and does nothing on Cancel', async () => {
        const user = userEvent.setup();

        render(
            <ChatDirectThreadMenu
                chatId="chat-1"
                participants={[]}
                canCreateDirect={false}
            />,
        );

        await chooseDeleteFromMenu(user);

        expect(
            await screen.findByRole('alertdialog', {
                name: 'confirmDestructive.deleteDirectChatTitle',
            }),
        ).toBeTruthy();
        expect(deleteDirectChat).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'common.cancel' }));

        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(deleteDirectChat).not.toHaveBeenCalled();
    });

    it('deletes the chat once the user confirms', async () => {
        const user = userEvent.setup();

        render(
            <ChatDirectThreadMenu
                chatId="chat-1"
                participants={[]}
                canCreateDirect={false}
            />,
        );

        await chooseDeleteFromMenu(user);
        await user.click(
            await screen.findByRole('button', { name: 'common.delete' }),
        );

        expect(deleteDirectChat).toHaveBeenCalledExactlyOnceWith('chat-1');
    });
});
