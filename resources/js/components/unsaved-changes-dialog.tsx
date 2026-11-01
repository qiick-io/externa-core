import { useTranslation } from 'react-i18next';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import type { UnsavedChangesDialogCopy } from '@/lib/unsaved-changes/registry';
import { cn } from '@/lib/utils';

export type UnsavedChangesDialogProps = {
    open: boolean;
    onKeepEditing: () => void;
    onDiscard: () => void;
    copy?: UnsavedChangesDialogCopy;
};

/**
 * Keep editing / Discard confirmation for dirty forms.
 * Esc dismiss maps to Keep editing (not discard). Overlay click does not
 * dismiss (AlertDialog default).
 */
export function UnsavedChangesDialog({
    open,
    onKeepEditing,
    onDiscard,
    copy,
}: UnsavedChangesDialogProps) {
    const { t } = useTranslation();

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    onKeepEditing();
                }
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t(copy?.titleKey ?? 'unsavedChanges.title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t(
                            copy?.descriptionKey ??
                                'unsavedChanges.description',
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:justify-end">
                    <AlertDialogAction
                        className={cn(
                            buttonVariants({ variant: 'outline' }),
                            'bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                        onClick={(event) => {
                            event.preventDefault();
                            onDiscard();
                        }}
                    >
                        {t(copy?.discardKey ?? 'unsavedChanges.discard')}
                    </AlertDialogAction>
                    <AlertDialogCancel
                        className={cn(buttonVariants({ variant: 'default' }))}
                        onClick={(event) => {
                            event.preventDefault();
                            onKeepEditing();
                        }}
                    >
                        {t('unsavedChanges.keepEditing')}
                    </AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
