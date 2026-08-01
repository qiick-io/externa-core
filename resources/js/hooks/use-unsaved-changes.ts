import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type {
    UnsavedChangesDialogCopy,
    UnsavedChangesEntry,
    UnsavedChangesScope,
} from '@/lib/unsaved-changes/registry';
import { notifyUnsavedChangesRegistry } from '@/lib/unsaved-changes/registry';

export type RegisterUnsavedChangesOptions = {
    scope: UnsavedChangesScope;
    isDirty: boolean;
    onDiscard?: () => void;
    enabled?: boolean;
    dialogCopy?: UnsavedChangesDialogCopy;
};

export type UnsavedChangesContextValue = {
    requestLeave: () => Promise<boolean>;
    /** Same confirm as leave, but callers stay on the page after discard. */
    requestDiscard: () => Promise<boolean>;
    hasUnsavedChanges: boolean;
    register: (options: {
        id?: symbol;
        scope: UnsavedChangesScope;
        isDirty: () => boolean;
        onDiscard?: () => void;
        dialogCopy?: UnsavedChangesDialogCopy;
    }) => () => void;
};

export const UnsavedChangesContext =
    createContext<UnsavedChangesContextValue | null>(null);

export function useUnsavedChanges(): UnsavedChangesContextValue {
    const context = useContext(UnsavedChangesContext);

    if (!context) {
        throw new Error(
            'useUnsavedChanges must be used within UnsavedChangesProvider',
        );
    }

    return context;
}

export function useRequestLeave(): () => Promise<boolean> {
    return useUnsavedChanges().requestLeave;
}

/**
 * Registers a dirty source with the leave guard.
 */
export function useRegisterUnsavedChanges({
    scope,
    isDirty,
    onDiscard,
    enabled = true,
    dialogCopy,
}: RegisterUnsavedChangesOptions): void {
    const { register } = useUnsavedChanges();
    const isDirtyRef = useRef(isDirty);
    const onDiscardRef = useRef(onDiscard);
    const dialogCopyRef = useRef(dialogCopy);

    const reactId = useId();
    const stableIdRef = useRef<symbol | null>(null);

    if (!stableIdRef.current) {
        stableIdRef.current = Symbol(`unsavedChanges-${reactId}`);
    }

    // Sync during render so requestLeave never reads a stale pre-effect ref.
    isDirtyRef.current = isDirty;
    onDiscardRef.current = onDiscard;
    dialogCopyRef.current = dialogCopy;

    useEffect(() => {
        notifyUnsavedChangesRegistry();
    }, [isDirty]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        return register({
            id: stableIdRef.current!,
            isDirty: () => isDirtyRef.current,
            onDiscard: () => onDiscardRef.current?.(),
            scope,
            dialogCopy: dialogCopyRef.current,
        });
    }, [enabled, register, scope, dialogCopy]);
}

/**
 * Thin helper for Vaul/shadcn drawers: open freely, close via requestLeave.
 */
export function guardedOpenChange(
    next: boolean,
    requestLeave: () => Promise<boolean>,
    setOpen: (open: boolean) => void,
): void {
    if (next) {
        setOpen(true);

        return;
    }

    void requestLeave().then((ok) => {
        if (ok) {
            setOpen(false);
        }
    });
}

export type { UnsavedChangesEntry, UnsavedChangesScope, UnsavedChangesDialogCopy };
