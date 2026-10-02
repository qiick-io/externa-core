import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import type { ReactNode } from 'react';

type ContentLocaleContextValue = {
    locales: string[];
    activeLocale: string;
    setActiveLocale: (locale: string) => void;
    /** Side-by-side translation workspace (#49). */
    workspaceEnabled: boolean;
    sourceLocale: string;
    setSourceLocale: (locale: string) => void;
};

const ContentLocaleContext = createContext<ContentLocaleContextValue | null>(
    null,
);

/**
 * Shared editing language for translatable collection fields on a form.
 */
export function ContentLocaleProvider({
    locales,
    defaultLocale,
    workspaceEnabled = false,
    sourceLocale: sourceLocaleProp,
    onSourceLocaleChange,
    children,
}: {
    locales: string[];
    defaultLocale?: string;
    workspaceEnabled?: boolean;
    sourceLocale?: string;
    onSourceLocaleChange?: (locale: string) => void;
    children: ReactNode;
}) {
    const initial =
        defaultLocale && locales.includes(defaultLocale)
            ? defaultLocale
            : (locales[0] ?? 'en');
    const [activeLocale, setActiveLocale] = useState(initial);
    const [sourceLocaleState, setSourceLocaleState] = useState(() => {
        if (sourceLocaleProp && locales.includes(sourceLocaleProp)) {
            return sourceLocaleProp;
        }

        const fallback = locales.find((code) => code !== initial);

        return fallback ?? initial;
    });

    useEffect(() => {
        if (defaultLocale && locales.includes(defaultLocale)) {
            setActiveLocale(defaultLocale);
        }
    }, [defaultLocale, locales]);

    useEffect(() => {
        if (sourceLocaleProp && locales.includes(sourceLocaleProp)) {
            setSourceLocaleState(sourceLocaleProp);
        }
    }, [sourceLocaleProp, locales]);

    const setSourceLocale = useCallback(
        (locale: string): void => {
            setSourceLocaleState(locale);
            onSourceLocaleChange?.(locale);
        },
        [onSourceLocaleChange],
    );

    const active = locales.includes(activeLocale)
        ? activeLocale
        : (locales[0] ?? activeLocale);
    let source = locales.includes(sourceLocaleState)
        ? sourceLocaleState
        : (locales.find((code) => code !== active) ?? active);

    // Keep source ≠ target when possible.
    if (workspaceEnabled && source === active && locales.length > 1) {
        source = locales.find((code) => code !== active) ?? source;
    }

    const value = useMemo(
        () => ({
            locales,
            activeLocale: active,
            setActiveLocale,
            workspaceEnabled,
            sourceLocale: source,
            setSourceLocale,
        }),
        [locales, active, workspaceEnabled, source, setSourceLocale],
    );

    return (
        <ContentLocaleContext.Provider value={value}>
            {children}
        </ContentLocaleContext.Provider>
    );
}

/**
 * Hook for the shared content editing locale (falls back to first locale).
 */
export function useContentLocale(localesFallback: string[] = ['en']): {
    locale: string;
    setLocale: (locale: string) => void;
    locales: string[];
    workspaceEnabled: boolean;
    sourceLocale: string;
    setSourceLocale: (locale: string) => void;
} {
    const ctx = useContext(ContentLocaleContext);
    const [localLocale, setLocalLocale] = useState(localesFallback[0] ?? 'en');

    if (ctx) {
        return {
            locale: ctx.activeLocale,
            setLocale: ctx.setActiveLocale,
            locales: ctx.locales,
            workspaceEnabled: ctx.workspaceEnabled,
            sourceLocale: ctx.sourceLocale,
            setSourceLocale: ctx.setSourceLocale,
        };
    }

    const locales = localesFallback.length > 0 ? localesFallback : ['en'];

    return {
        locale: locales.includes(localLocale)
            ? localLocale
            : (locales[0] ?? 'en'),
        setLocale: setLocalLocale,
        locales,
        workspaceEnabled: false,
        sourceLocale: locales[0] ?? 'en',
        setSourceLocale: () => undefined,
    };
}
