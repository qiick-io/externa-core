import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UnsavedChangesToolbar } from '@/components/unsaved-changes-toolbar';

type SettingsFormActionsProps = {
    processing: boolean;
    recentlySuccessful: boolean;
    isDirty?: boolean;
    'data-test'?: string;
};

/**
 * Sticky Save bar for settings forms — pinned to the bottom of the
 * settings content scroll pane while the form scrolls underneath.
 */
export function SettingsFormActions({
    processing,
    recentlySuccessful,
    isDirty = false,
    'data-test': dataTest,
}: SettingsFormActionsProps) {
    const { t } = useTranslation();

    return (
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-border/80 bg-background/90 px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md supports-backdrop-filter:bg-background/75">
            <div
                className="flex w-full flex-wrap items-center justify-end gap-4"
                role="status"
                aria-live="polite"
                aria-busy={processing || undefined}
            >
                {recentlySuccessful ? (
                    <p className="animate-in text-sm text-muted-foreground duration-200 ease-in-out fade-in">
                        {t('common.saved')}
                    </p>
                ) : null}
                {processing ? (
                    <span className="sr-only">{t('a11y.saving')}</span>
                ) : null}
                <UnsavedChangesToolbar
                    isDirty={isDirty}
                    className="flex items-center gap-2"
                />
                <Button
                    type="submit"
                    disabled={processing}
                    data-test={dataTest}
                    aria-busy={processing || undefined}
                >
                    <Save className="size-4" aria-hidden="true" />
                    {t('common.save')}
                </Button>
            </div>
        </div>
    );
}
