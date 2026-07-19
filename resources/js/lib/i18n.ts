import { router } from '@inertiajs/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import it from '@/locales/it.json';

let navigateBound = false;

/**
 * Initialize (or sync) react-i18next with the Inertia shared locale.
 */
export function initI18n(locale = 'en'): typeof i18n {
    if (!i18n.isInitialized) {
        void i18n.use(initReactI18next).init({
            resources: {
                en: { translation: en },
                it: { translation: it },
                de: { translation: de },
            },
            lng: locale,
            fallbackLng: 'en',
            interpolation: { escapeValue: false },
        });
    } else if (i18n.language !== locale) {
        void i18n.changeLanguage(locale);
    }

    if (!navigateBound && typeof window !== 'undefined') {
        navigateBound = true;
        router.on('navigate', (event) => {
            const next = event.detail.page.props.locale;
            if (typeof next === 'string' && next !== i18n.language) {
                void i18n.changeLanguage(next);
            }
        });
    }

    return i18n;
}

export default i18n;
