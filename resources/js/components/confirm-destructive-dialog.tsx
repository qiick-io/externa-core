import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type ConfirmDestructiveDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirming?: boolean;
    onConfirm: () => void;
    /**
     * When set, the confirm action stays disabled until the user types this
     * exact string (used for irreversible force-delete).
     */
    typedConfirmation?: string;
};

/**
 * Shared Cancel / Delete confirmation for destructive admin actions.
 * Esc dismiss maps to Cancel (not confirm). Overlay click does not dismiss
 * (AlertDialog default).
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
    typedConfirmation,
}: ConfirmDestructiveDialogProps) {
    const { t } = useTranslation();
    const inputId = useId();
    const [typedValue, setTypedValue] = useState('');

    useEffect(() => {
        if (!open) {
            setTypedValue('');
        }
    }, [open]);

    const requiresTypedConfirmation =
        typeof typedConfirmation === 'string' && typedConfirmation.length > 0;
    const typedMatches =
        !requiresTypedConfirmation || typedValue === typedConfirmation;
    const confirmDisabled = confirming || !typedMatches;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription
                        asChild={typeof description !== 'string'}
                    >
                        {typeof description === 'string' ? (
                            description
                        ) : (
                            <div>{description}</div>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {requiresTypedConfirmation ? (
                    <div className="grid gap-2">
                        <Label htmlFor={inputId}>
                            {t('confirmDestructive.typeToConfirm', {
                                name: typedConfirmation,
                            })}
                        </Label>
                        <Input
                            id={inputId}
                            value={typedValue}
                            autoComplete="off"
                            data-test="confirm-destructive-typed"
                            disabled={confirming}
                            onChange={(event) =>
                                setTypedValue(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (
                                    event.key === 'Enter' &&
                                    typedMatches &&
                                    !confirming
                                ) {
                                    event.preventDefault();
                                    onConfirm();
                                }
                            }}
                        />
                    </div>
                ) : null}
                <AlertDialogFooter className="gap-2 sm:justify-end">
                    <AlertDialogCancel disabled={confirming}>
                        {cancelLabel ?? t('common.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={confirmDisabled}
                        data-test="confirm-destructive"
                        onClick={(event) => {
                            event.preventDefault();

                            if (confirmDisabled) {
                                return;
                            }

                            onConfirm();
                        }}
                    >
                        {confirmLabel ?? t('common.delete')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
