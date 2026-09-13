import type { ReactNode } from 'react';
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

export type ConfirmDestructiveDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirming?: boolean;
    onConfirm: () => void;
};

/**
 * Shared Cancel / Delete confirmation for destructive admin actions.
 * Esc and overlay dismiss map to Cancel (not confirm).
 */
export function ConfirmDestructiveDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    confirming = false,
    onConfirm,
}: ConfirmDestructiveDialogProps) {
    const { t } = useTranslation();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="z-[100]"
                onPointerDownOutside={(event) => {
                    event.preventDefault();
                    onOpenChange(false);
                }}
                onEscapeKeyDown={(event) => {
                    event.preventDefault();
                    onOpenChange(false);
                }}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:justify-end">
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={confirming}
                        onClick={() => onOpenChange(false)}
                    >
                        {cancelLabel ?? t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={confirming}
                        data-test="confirm-destructive"
                        onClick={onConfirm}
                    >
                        {confirmLabel ?? t('common.delete')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
