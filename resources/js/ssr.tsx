import { createInertiaApp } from '@inertiajs/react';
import createServer from '@inertiajs/react/server';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import ReactDOMServer from 'react-dom/server';
import { UnsavedChangesProvider } from '@/components/unsaved-changes-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initI18n } from '@/lib/i18n';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createServer((page) => {
    const locale =
        typeof page.props.locale === 'string' ? page.props.locale : 'en';
    initI18n(locale);

    return createInertiaApp({
        page,
        render: ReactDOMServer.renderToString,
        title: (title) => (title ? `${title} - ${appName}` : appName),
        resolve: (name) =>
            resolvePageComponent(
                `./pages/${name}.tsx`,
                import.meta.glob('./pages/**/*.tsx'),
            ),
        setup: ({ App, props }) => {
            return (
                <TooltipProvider delayDuration={0}>
                    <UnsavedChangesProvider>
                        <App {...props} />
                    </UnsavedChangesProvider>
                </TooltipProvider>
            );
        },
    });
});
