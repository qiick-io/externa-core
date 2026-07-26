import { useSyncExternalStore } from 'react';

export type AccessibilityPreferences = {
    readonly highContrastEnabled: boolean;
    readonly reduceMotionEnabled: boolean;
};

export type UseAccessibilityPreferencesReturn = AccessibilityPreferences & {
    readonly enabledCount: number;
    readonly updateHighContrast: (enabled: boolean) => void;
    readonly updateReduceMotion: (enabled: boolean) => void;
    readonly toggleHighContrast: () => void;
    readonly toggleReduceMotion: () => void;
};

const HIGH_CONTRAST_STORAGE_KEY = 'accessibility_high_contrast';
const REDUCE_MOTION_STORAGE_KEY = 'accessibility_reduce_motion';
const HIGH_CONTRAST_COOKIE = 'accessibility_high_contrast';
const REDUCE_MOTION_COOKIE = 'accessibility_reduce_motion';
const HIGH_CONTRAST_CLASS = 'high-contrast';
const REDUCE_MOTION_CLASS = 'reduce-motion';

const listeners = new Set<() => void>();

let currentPreferences: AccessibilityPreferences = {
    highContrastEnabled: false,
    reduceMotionEnabled: false,
};

const setCookie = (name: string, value: string, days = 365): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const readFlag = (storageKey: string): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    return localStorage.getItem(storageKey) === '1';
};

const applyClasses = (preferences: AccessibilityPreferences): void => {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.classList.toggle(
        HIGH_CONTRAST_CLASS,
        preferences.highContrastEnabled,
    );
    // OS prefers-reduced-motion is honored in CSS; class only forces user on.
    document.documentElement.classList.toggle(
        REDUCE_MOTION_CLASS,
        preferences.reduceMotionEnabled,
    );
};

const persistFlag = (
    cookieName: string,
    storageKey: string,
    enabled: boolean,
): void => {
    if (typeof window === 'undefined') {
        return;
    }

    if (enabled) {
        localStorage.setItem(storageKey, '1');
        setCookie(cookieName, '1');
    } else {
        localStorage.removeItem(storageKey);
        setCookie(cookieName, '0');
    }
};

const subscribe = (callback: () => void) => {
    listeners.add(callback);

    return () => listeners.delete(callback);
};

const notify = (): void => listeners.forEach((listener) => listener());

const setPreferences = (next: AccessibilityPreferences): void => {
    currentPreferences = next;
    applyClasses(next);
    notify();
};

/**
 * Applies stored accessibility preferences (no localStorage write).
 * Call once from `app.tsx` after Inertia props are available.
 */
export function initializeAccessibilityPreferences(): void {
    if (typeof window === 'undefined') {
        return;
    }

    setPreferences({
        highContrastEnabled: readFlag(HIGH_CONTRAST_STORAGE_KEY),
        reduceMotionEnabled: readFlag(REDUCE_MOTION_STORAGE_KEY),
    });
}

/**
 * Reads and updates high-contrast / reduce-motion preferences.
 * Persists to `localStorage` and cookies for Blade pre-paint classes.
 */
export function useAccessibilityPreferences(): UseAccessibilityPreferencesReturn {
    const preferences = useSyncExternalStore(
        subscribe,
        () => currentPreferences,
        () =>
            ({
                highContrastEnabled: false,
                reduceMotionEnabled: false,
            }) as const,
    );

    const updateHighContrast = (enabled: boolean): void => {
        persistFlag(HIGH_CONTRAST_COOKIE, HIGH_CONTRAST_STORAGE_KEY, enabled);
        setPreferences({
            ...currentPreferences,
            highContrastEnabled: enabled,
        });
    };

    const updateReduceMotion = (enabled: boolean): void => {
        persistFlag(REDUCE_MOTION_COOKIE, REDUCE_MOTION_STORAGE_KEY, enabled);
        setPreferences({
            ...currentPreferences,
            reduceMotionEnabled: enabled,
        });
    };

    const enabledCount =
        Number(preferences.highContrastEnabled) +
        Number(preferences.reduceMotionEnabled);

    return {
        highContrastEnabled: preferences.highContrastEnabled,
        reduceMotionEnabled: preferences.reduceMotionEnabled,
        enabledCount,
        updateHighContrast,
        updateReduceMotion,
        toggleHighContrast: () =>
            updateHighContrast(!currentPreferences.highContrastEnabled),
        toggleReduceMotion: () =>
            updateReduceMotion(!currentPreferences.reduceMotionEnabled),
    } as const;
}
