import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

import { AiModelStatusBadge } from '@/components/ai/ai-model-status-badge';

describe('AiModelStatusBadge', () => {
    afterEach(() => {
        cleanup();
    });

    it.each([
        ['recommended', 'success'],
        ['supported', 'info'],
        ['deprecated', 'warning'],
        ['unverified', 'muted'],
    ] as const)('shows %s with the %s variant', (status, variant) => {
        render(<AiModelStatusBadge status={status} />);

        const badge = screen.getByText(
            `settings.aiTools.models.status.${status}`,
        );

        expect(badge.getAttribute('data-variant')).toBe(variant);
    });
});
