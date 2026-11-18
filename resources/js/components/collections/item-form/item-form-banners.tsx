import { router } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * Notice that unsaved input was restored from the browser's local draft,
 * with a button to throw that draft away.
 */
export function ItemDraftRestoredBanner({
    onDiscard,
}: {
    onDiscard: () => void;
}) {
    const { t } = useTranslation();

    return (
        <div
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            data-test="item-draft-banner"
        >
            <span>{t('collections.items.form.draftRestored')}</span>
            <Button
                type="button"
                variant="outline"
                data-test="discard-item-draft"
                onClick={onDiscard}
            >
                {t('collections.items.form.discardDraft')}
            </Button>
        </div>
    );
}

/**
 * Notice that another editor saved the item after it was loaded here, with a
 * reload button.
 */
export function ItemStaleBanner() {
    const { t } = useTranslation();

    return (
        <div
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            data-test="item-stale-banner"
        >
            <span>{t('collections.itemPresence.staleDescription')}</span>
            <Button
                type="button"
                variant="outline"
                data-test="item-stale-reload"
                onClick={() => router.reload()}
            >
                {t('collections.itemPresence.staleReload')}
            </Button>
        </div>
    );
}
