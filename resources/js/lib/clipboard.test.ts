import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard, readTextFromClipboard } from './clipboard.ts';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('copyTextToClipboard', () => {
    it('uses the Clipboard API when writeText succeeds', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', {
            clipboard: { writeText },
        });

        await expect(copyTextToClipboard('hello')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');
    });

    it('falls back to execCommand when Clipboard API throws', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        vi.stubGlobal('navigator', {
            clipboard: { writeText },
        });
        const execCommand = vi.fn().mockReturnValue(true);
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: execCommand,
        });

        await expect(copyTextToClipboard('fallback')).resolves.toBe(true);
        expect(execCommand).toHaveBeenCalledWith('copy');
    });
});

describe('readTextFromClipboard', () => {
    it('returns clipboard text when available', async () => {
        const readText = vi.fn().mockResolvedValue('pasted');
        vi.stubGlobal('navigator', {
            clipboard: { readText },
        });

        await expect(readTextFromClipboard()).resolves.toBe('pasted');
    });

    it('returns null when Clipboard API is unavailable', async () => {
        vi.stubGlobal('navigator', {});

        await expect(readTextFromClipboard()).resolves.toBeNull();
    });
});
