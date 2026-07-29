import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export type UnsavedChangesDialogProps = {
    open: boolean;
    onKeepEditing: () => void;
    onDiscard: () => void;
};

/**
 * Keep editing / Discard confirmation for dirty forms.
 * Esc and overlay dismiss map to Keep editing (not discard).
 */
export function UnsavedChangesDialog({
    open,
    onKeepEditing,
    onDiscard,
}: UnsavedChangesDialogProps) {
    const { t } = useTranslation();

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    onKeepEditing();
                }
            }}
        >
            <DialogContent
                className="z-[100]"
                onPointerDownOutside={(event) => {
                    event.preventDefault();
                    onKeepEditing();
                }}
                onEscapeKeyDown={(event) => {
                    event.preventDefault();
                    onKeepEditing();
                }}
            >
                <DialogHeader>
                    <DialogTitle>{t('unsavedChanges.title')}</DialogTitle>
                    <DialogDescription>
                        {t('unsavedChanges.description')}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:justify-end">
                    <Button type="button" variant="outline" onClick={onDiscard}>
                        {t('unsavedChanges.discard')}
                    </Button>
                    <Button type="button" onClick={onKeepEditing}>
                        {t('unsavedChanges.keepEditing')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
