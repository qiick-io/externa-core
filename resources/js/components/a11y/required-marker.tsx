import { useTranslation } from 'react-i18next';

/**
 * Required-field marker: keep the visual asterisk, announce “required” in text
 * (not colour/asterisk alone — WCAG 2.2 AA / #253).
 */
export function RequiredMarker() {
    const { t } = useTranslation();

    return (
        <>
            <span className="text-destructive" aria-hidden="true">
                {' '}
                *
            </span>
            <span className="sr-only">{t('a11y.required')}</span>
        </>
    );
}
