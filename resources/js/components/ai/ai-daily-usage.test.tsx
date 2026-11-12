import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({
        props: {
            auth: {
                user: { id: 1 },
                permissions: ['can-use-ai'],
                isSuperAdmin: false,
            },
        },
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string>) =>
            values ? `${key} ${JSON.stringify(values)}` : key,
    }),
}));

import { AiDailyUsage } from '@/components/ai/ai-daily-usage';
import { resetAiAvailabilityForTests } from '@/hooks/use-ai-availability';

function mockAiStatus(dailyUsage: unknown): void {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ online: true, daily_usage: dailyUsage }),
        }),
    );
}

describe('AiDailyUsage', () => {
    afterEach(() => {
        cleanup();
        resetAiAvailabilityForTests();
        vi.unstubAllGlobals();
    });

    it('shows the prompts and tokens used against the limits that are set', async () => {
        mockAiStatus({
            prompts_used: 3,
            prompt_limit: 50,
            tokens_used: 1200,
            token_budget: null,
        });

        render(<AiDailyUsage />);

        const usage = await screen.findByText(/ai\.dailyUsage\.label/);

        expect(usage.textContent).toContain('ai.dailyUsage.prompts');
        expect(usage.textContent).not.toContain('ai.dailyUsage.tokens');
    });

    it('renders nothing when no daily limit is set', async () => {
        mockAiStatus(null);

        const { container } = render(<AiDailyUsage />);

        await waitFor(() => expect(fetch).toHaveBeenCalled());

        expect(container).toBeEmptyDOMElement();
    });
});
