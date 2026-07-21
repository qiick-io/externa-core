import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

type ContentLocaleContextValue = {
    locales: string[];
    activeLocale: string;
    setActiveLocale: (locale: string) => void;
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
    children,
}: {
    locales: string[];
    defaultLocale?: string;
    children: ReactNode;
}) {
    const initial =
        defaultLocale && locales.includes(defaultLocale)
            ? defaultLocale
            : (locales[0] ?? 'en');
    const [activeLocale, setActiveLocale] = useState(initial);

    const value = useMemo(
        () => ({
            locales,
            activeLocale: locales.includes(activeLocale)
                ? activeLocale
                : (locales[0] ?? activeLocale),
            setActiveLocale,
        }),
        [locales, activeLocale],
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
} {
    const ctx = useContext(ContentLocaleContext);
    const [localLocale, setLocalLocale] = useState(
        localesFallback[0] ?? 'en',
    );

    if (ctx) {
        return {
            locale: ctx.activeLocale,
            setLocale: ctx.setActiveLocale,
            locales: ctx.locales,
        };
    }

    const locales =
        localesFallback.length > 0 ? localesFallback : ['en'];

    return {
        locale: locales.includes(localLocale)
            ? localLocale
            : (locales[0] ?? 'en'),
        setLocale: setLocalLocale,
        locales,
    };
}
