import { usePage } from '@inertiajs/react';
import { useState } from 'react';
import { LocalizedField } from '@/components/collections/localized-field';
import {
    COLLECTION_FIELD_LOCALES,
    type TranslatedText,
} from '@/lib/collection-field-types';

type TranslatedInputProps = {
    idPrefix: string;
    label: string;
    description?: string;
    value: TranslatedText;
    onChange: (next: TranslatedText) => void;
    namePrefix?: string;
    locales?: string[];
};

/**
 * Locale-switcher input for translatable field labels/settings.
 */
export function TranslatedInput({
    idPrefix,
    label,
    description,
    value,
    onChange,
    namePrefix,
    locales: localesProp,
}: TranslatedInputProps) {
    const { collectionLocales } = usePage().props;
    const locales =
        localesProp ??
        (Array.isArray(collectionLocales) && collectionLocales.length > 0
            ? collectionLocales
            : [...COLLECTION_FIELD_LOCALES]);
    const [locale, setLocale] = useState(locales[0] ?? 'en');

    return (
        <LocalizedField
            locales={locales}
            locale={locale}
            onLocaleChange={setLocale}
            value={value}
            onChange={onChange}
            label={label}
            description={description}
            idPrefix={idPrefix}
            namePrefix={namePrefix}
        />
    );
}
