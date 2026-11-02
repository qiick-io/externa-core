import i18n from '@/lib/i18n';

/**
 * Resolve the active app locale for Intl formatters (falls back to English).
 */
export function appLocale(language = i18n.language): string {
    const raw = (language || 'en').split('-')[0]?.toLowerCase() ?? 'en';

    if (raw === 'it' || raw === 'de' || raw === 'en') {
        return raw;
    }

    return 'en';
}

/**
 * BCP 47 tag for Web Speech Recognition from the app UI locale.
 */
export function speechRecognitionLang(language = i18n.language): string {
    switch (appLocale(language)) {
        case 'it':
            return 'it-IT';
        case 'de':
            return 'de-DE';
        default:
            return 'en-US';
    }
}

/**
 * Locale-aware date/time formatting using the active i18n language.
 */
export function formatDateTime(
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
    language = i18n.language,
): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString(appLocale(language), options);
}

/**
 * Locale-aware number formatting using the active i18n language.
 */
export function formatNumber(
    value: number,
    options?: Intl.NumberFormatOptions,
    language = i18n.language,
): string {
    return value.toLocaleString(appLocale(language), options);
}
