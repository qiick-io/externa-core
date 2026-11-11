import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { initializeTheme, teardownTheme } from './use-appearance';

describe('initializeTheme media-query listener', () => {
    afterEach(() => {
        teardownTheme();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('binds the prefers-color-scheme listener only once', () => {
        const addEventListener = vi.fn();
        const removeEventListener = vi.fn();

        // jsdom does not implement matchMedia, so stub it instead of spying on it.
        vi.stubGlobal(
            'matchMedia',
            vi.fn().mockReturnValue({
                matches: false,
                media: '(prefers-color-scheme: dark)',
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener,
                removeEventListener,
                dispatchEvent: vi.fn(),
            } as MediaQueryList),
        );

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
