import { useSyncExternalStore } from 'react';

export type ResolvedAppearance = 'light' | 'dark';
export type Appearance = ResolvedAppearance | 'system';

export type UseAppearanceReturn = {
    readonly appearance: Appearance;
    readonly resolvedAppearance: ResolvedAppearance;
    readonly updateAppearance: (mode: Appearance) => void;
};

const listeners = new Set<() => void>();
let currentAppearance: Appearance = 'system';

const prefersDark = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const setCookie = (name: string, value: string, days = 365): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const isAppearance = (value: string | null): value is Appearance => {
    return value === 'light' || value === 'dark' || value === 'system';
};

const getStoredAppearance = (): Appearance | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const stored = localStorage.getItem('appearance');

    return isAppearance(stored) ? stored : null;
};

const isDarkMode = (appearance: Appearance): boolean => {
    return appearance === 'dark' || (appearance === 'system' && prefersDark());
};

const applyTheme = (appearance: Appearance): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const isDark = isDarkMode(appearance);

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
};

const subscribe = (callback: () => void) => {
    listeners.add(callback);

    return () => listeners.delete(callback);
};

const notify = (): void => listeners.forEach((listener) => listener());

const mediaQuery = (): MediaQueryList | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.matchMedia('(prefers-color-scheme: dark)');
};

const handleSystemThemeChange = (): void => applyTheme(currentAppearance);

/**
 * Applies stored personal preference, else the project default (no localStorage write).
 * Call once from `app.tsx` after Inertia props are available.
 *
 * @param {Appearance} [projectDefault='system'] - Project default when user has no preference
 * @returns {void}
 */
export function initializeTheme(projectDefault: Appearance = 'system'): void {
    if (typeof window === 'undefined') {
        return;
    }

    const stored = getStoredAppearance();
    const fallback = isAppearance(projectDefault) ? projectDefault : 'system';

    // ponytail: personal localStorage wins; project default is never persisted until the user chooses
    currentAppearance = stored ?? fallback;
    applyTheme(currentAppearance);

    mediaQuery()?.addEventListener('change', handleSystemThemeChange);
}

/**
 * Reads and updates the user's light/dark/system appearance preference.
 * Persists to `localStorage` and a cookie for SSR hydration.
 *
 * @returns Current mode, resolved light/dark value, and an updater
 */
export function useAppearance(): UseAppearanceReturn {
    const appearance: Appearance = useSyncExternalStore(
        subscribe,
        () => currentAppearance,
        () => 'system',
    );

    const resolvedAppearance: ResolvedAppearance = isDarkMode(appearance)
        ? 'dark'
        : 'light';

    const updateAppearance = (mode: Appearance): void => {
        currentAppearance = mode;

        localStorage.setItem('appearance', mode);
        setCookie('appearance', mode);

        applyTheme(mode);
        notify();
    };

    return { appearance, resolvedAppearance, updateAppearance } as const;
}
