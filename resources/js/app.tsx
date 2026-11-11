import { createInertiaApp } from '@inertiajs/react';
import type { ResolvedComponent } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { FocusAfterNavigation } from '@/components/focus-after-navigation';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UnsavedChangesProvider } from '@/components/unsaved-changes-provider';
import '../css/app.css';
import { initializeAccessibilityPreferences } from '@/hooks/use-accessibility-preferences';
import type { Appearance } from '@/hooks/use-appearance';
import { initializeTheme, useAppearance } from '@/hooks/use-appearance';
import { ensureEcho, isRealtimeEnabled } from '@/lib/echo';
import { initI18n } from '@/lib/i18n';
import type { ProjectAppearance } from '@/types/appearance';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

/**
 * The app's one Toaster (app-ui `docs/notifications.md`): position, offset, colours and
 * durations come from the `@qiick/sonner` item; the app only passes its appearance.
 */
function AppToaster() {
    const { resolvedAppearance } = useAppearance();

    return <Toaster theme={resolvedAppearance} />;
}

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
            // Each page module's default export, typed as Inertia 3's resolver expects.
            import.meta.glob<ResolvedComponent>('./pages/**/*.tsx', {
                import: 'default',
            }),
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
                        {/* Provider wraps App so page-level hooks are inside context. */}
                        <UnsavedChangesProvider>
                            <FocusAfterNavigation />
                            <App {...props} />
                        </UnsavedChangesProvider>
                        <AppToaster />
                    </TooltipProvider>
                </AppErrorBoundary>
            </StrictMode>,
        );
    },
    progress: {
        // Theme token, so the bar follows the brand and dark mode.
        color: 'var(--primary)',
    },
});
