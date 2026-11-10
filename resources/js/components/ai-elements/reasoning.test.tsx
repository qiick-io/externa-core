import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reasoning } from '@/components/ai-elements/reasoning';
import { Trace } from '@/components/ui/trace';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const reasoningText = 'The model weighs the options.';

const renderReasoning = (isStreaming: boolean) => (
    <Trace>
        <Reasoning isStreaming={isStreaming} duration={isStreaming ? 0 : 4}>
            {reasoningText}
        </Reasoning>
    </Trace>
);

describe('Reasoning', () => {
    it('opens while it streams and closes when it finishes', () => {
        const { rerender } = render(renderReasoning(true));

        expect(screen.getByText(reasoningText)).toBeVisible();

        rerender(renderReasoning(false));

        expect(screen.queryByText(reasoningText)).toBeNull();
    });

    it('keeps the person’s choice once they close it', () => {
        const { rerender } = render(renderReasoning(true));

        fireEvent.click(screen.getByRole('button'));
        expect(screen.queryByText(reasoningText)).toBeNull();

        rerender(renderReasoning(true));
        expect(screen.queryByText(reasoningText)).toBeNull();
    });
});
