import { useTranslation } from 'react-i18next';

/**
 * First focusable control: jump past chrome to the main landmark.
 */
export function SkipToContent() {
    const { t } = useTranslation();

    return (
        <a
            href="#main-content"
            className="sr-only bg-background text-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring focus:outline-none"
        >
            {t('a11y.skipToContent')}
        </a>
    );
}
