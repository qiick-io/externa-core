import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeTheme, teardownTheme } from './use-appearance';

describe('initializeTheme media-query listener', () => {
    afterEach(() => {
        teardownTheme();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('binds the prefers-color-scheme listener only once', () => {
        const addEventListener = vi.fn();
        const removeEventListener = vi.fn();

        vi.spyOn(window, 'matchMedia').mockReturnValue({
            matches: false,
            media: '(prefers-color-scheme: dark)',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener,
            removeEventListener,
            dispatchEvent: vi.fn(),
        } as MediaQueryList);

        initializeTheme('system');
        initializeTheme('system');

        expect(addEventListener).toHaveBeenCalledTimes(1);
        expect(addEventListener).toHaveBeenCalledWith(
            'change',
            expect.any(Function),
        );

        teardownTheme();
        expect(removeEventListener).toHaveBeenCalledTimes(1);
    });
});
