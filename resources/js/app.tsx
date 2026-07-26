import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import '../css/app.css';
import { initializeAccessibilityPreferences } from '@/hooks/use-accessibility-preferences';
import type { Appearance } from '@/hooks/use-appearance';
import { initializeTheme } from '@/hooks/use-appearance';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import { initI18n } from '@/lib/i18n';
import type { ProjectAppearance } from '@/types/appearance';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

const resolveProjectDefaultAppearance = (
    projectAppearance: unknown,
): Appearance => {
    if (
        projectAppearance &&
        typeof projectAppearance === 'object' &&
        'defaultAppearance' in projectAppearance
    ) {
        const value = (projectAppearance as ProjectAppearance)
            .defaultAppearance;

        if (value === 'light' || value === 'dark' || value === 'system') {
            return value;
        }
    }

    return 'system';
};

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const locale =
            typeof props.initialPage.props.locale === 'string'
                ? props.initialPage.props.locale
                : 'en';
        initI18n(locale);

        initializeTheme(
            resolveProjectDefaultAppearance(
                props.initialPage.props.projectAppearance,
            ),
        );
        initializeAccessibilityPreferences();

        if (
            props.initialPage.props.auth?.user &&
            isRealtimeEnabled(props.initialPage.props.realtime)
        ) {
            ensureEcho(true);
        }

        const root = createRoot(el);

        root.render(
            <StrictMode>
                <AppErrorBoundary>
                    <TooltipProvider delayDuration={0}>
                        <App {...props} />
                        <Toaster position="top-right" duration={5000} />
                    </TooltipProvider>
                </AppErrorBoundary>
            </StrictMode>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});
