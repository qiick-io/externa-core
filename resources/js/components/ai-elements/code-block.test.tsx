import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const copyTextToClipboard = vi.fn();

vi.mock('@/lib/clipboard', () => ({
    copyTextToClipboard: (text: string) => copyTextToClipboard(text),
}));

import { CodeBlockCopyButton } from '@/components/ai-elements/code-block';

describe('CodeBlockCopyButton', () => {
    afterEach(() => {
        cleanup();
        copyTextToClipboard.mockReset();
    });

    it('copies through lib/clipboard and reports success', async () => {
        copyTextToClipboard.mockResolvedValue(true);
        const onCopy = vi.fn();
        const onError = vi.fn();

        render(
            <CodeBlockCopyButton
                aria-label="Copy"
                onCopy={onCopy}
                onError={onError}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
        expect(copyTextToClipboard).toHaveBeenCalledWith('');
        expect(onError).not.toHaveBeenCalled();
    });

    it('reports an error when the copy fails', async () => {
        copyTextToClipboard.mockResolvedValue(false);
        const onCopy = vi.fn();
        const onError = vi.fn();

        render(
            <CodeBlockCopyButton
                aria-label="Copy"
                onCopy={onCopy}
                onError={onError}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        expect(onCopy).not.toHaveBeenCalled();
    });
});
