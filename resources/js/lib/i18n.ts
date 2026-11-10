import { router } from '@inertiajs/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import it from '@/locales/it.json';

let navigateBound = false;
let documentLangBound = false;

/**
 * Keep `<html lang>` aligned with the active UI locale (BCP 47).
 */
export function syncDocumentLanguage(locale: string): void {
    if (typeof document === 'undefined') {
        return;
    }

    const normalized = locale.replace('_', '-');

    if (document.documentElement.lang !== normalized) {
        document.documentElement.lang = normalized;
    }
}

/**
 * Keep <html lang> aligned with the active client locale.
 */
function syncDocumentLang(locale: string): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.lang = locale.replace('_', '-');
}

/**
 * Initialize (or sync) react-i18next with the Inertia shared locale.
 */
export function initI18n(locale = 'en'): typeof i18n {
    if (!i18n.isInitialized) {
        void i18n
            .use(initReactI18next)
            .init({
                resources: {
                    en: { translation: en },
                    it: { translation: it },
                    de: { translation: de },
                },
                lng: locale,
                fallbackLng: 'en',
                interpolation: { escapeValue: false },
            })
            .then(() => {
                syncDocumentLang(locale);
            });
        i18n.on('languageChanged', syncDocumentLang);
    } else if (i18n.language !== locale) {
        void i18n.changeLanguage(locale);
    } else {
        syncDocumentLang(locale);
    }

    syncDocumentLanguage(i18n.language || locale);

    if (!documentLangBound && typeof window !== 'undefined') {
        documentLangBound = true;
        i18n.on('languageChanged', (next) => {
            syncDocumentLanguage(next);
        });
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
