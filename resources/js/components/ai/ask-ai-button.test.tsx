import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';

const { authProps, openAiWithPrompt } = vi.hoisted(() => ({
    authProps: {
        auth: {
            user: { id: 1 },
            permissions: ['can-use-ai'] as string[],
            isSuperAdmin: false,
        },
    },
    openAiWithPrompt: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: authProps }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/ai-open', () => ({ openAiWithPrompt }));

import { AskAiButton } from '@/components/ai/ask-ai-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resetAiAvailabilityForTests } from '@/hooks/use-ai-availability';

function mockAiStatus(online: boolean): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ online, model: online ? 'test-model' : null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

function renderButtons() {
    return render(
        <TooltipProvider>
            <AskAiButton prompt="Row prompt" />
            <AskAiButton mode="labeled" prompt="Bulk prompt" />
        </TooltipProvider>,
    );
}

describe('AskAiButton availability', () => {
    beforeEach(() => {
        resetAiAvailabilityForTests();
        openAiWithPrompt.mockReset();
        authProps.auth.permissions = ['can-use-ai'];
    });

    afterEach(() => {
        cleanup();
        resetAiAvailabilityForTests();
        vi.unstubAllGlobals();
    });

    it('is aria-disabled with the offline reason and ignores clicks while AI is offline', async () => {
        const fetchMock = mockAiStatus(false);
        renderButtons();

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());

        const buttons = screen.getAllByRole('button', { name: 'ai.askAi' });

        expect(buttons).toHaveLength(2);

        for (const button of buttons) {
            expect(button).toHaveAttribute('aria-disabled', 'true');
            expect(button).toHaveAccessibleDescription('ai.aiOfflineHint');
            fireEvent.click(button);
        }

        expect(openAiWithPrompt).not.toHaveBeenCalled();
    });

    it('is enabled and seeds the prompt once AI is online', async () => {
        mockAiStatus(true);
        renderButtons();

        await waitFor(() =>
            expect(
                screen.getAllByRole('button', { name: 'ai.askAi' })[0],
            ).not.toHaveAttribute('aria-disabled'),
        );

        const [iconButton, labeledButton] = screen.getAllByRole('button', {
            name: 'ai.askAi',
        });

        expect(labeledButton).not.toHaveAttribute('aria-disabled');
        expect(iconButton).not.toHaveAccessibleDescription();

        fireEvent.click(iconButton);
        fireEvent.click(labeledButton);

        expect(openAiWithPrompt).toHaveBeenNthCalledWith(1, 'Row prompt');
        expect(openAiWithPrompt).toHaveBeenNthCalledWith(2, 'Bulk prompt');
    });

    it('shares one status probe across every mounted Ask AI button', async () => {
        const fetchMock = mockAiStatus(true);
        renderButtons();

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        await act(async () => {});

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stays hidden and never probes without CanUseAi', () => {
        authProps.auth.permissions = [];
        const fetchMock = mockAiStatus(true);
        const { container } = renderButtons();

        expect(container).toBeEmptyDOMElement();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
