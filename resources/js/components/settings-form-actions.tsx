import { Transition } from '@headlessui/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type SettingsFormActionsProps = {
    processing: boolean;
    recentlySuccessful: boolean;
    'data-test'?: string;
};

/**
 * Sticky Save bar for settings forms — pinned to the bottom of the
 * settings content scroll pane while the form scrolls underneath.
 */
export function SettingsFormActions({
    processing,
    recentlySuccessful,
    'data-test': dataTest,
}: SettingsFormActionsProps) {
    const { t } = useTranslation();

    return (
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-border/80 bg-background/90 px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md supports-backdrop-filter:bg-background/75">
            <div className="flex w-full items-center gap-4">
                <Button
                    type="submit"
                    disabled={processing}
                    data-test={dataTest}
                >
                    {t('common.save')}
                </Button>
                <Transition
                    show={recentlySuccessful}
                    enter="transition ease-in-out"
                    enterFrom="opacity-0"
                    leave="transition ease-in-out"
                    leaveTo="opacity-0"
                >
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {t('common.saved')}
                    </p>
                </Transition>
            </div>
        </div>
    );
}
