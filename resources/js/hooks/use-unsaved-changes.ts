import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type {
    UnsavedChangesEntry,
    UnsavedChangesScope,
} from '@/lib/unsaved-changes/registry';

export type RegisterUnsavedChangesOptions = {
    scope: UnsavedChangesScope;
    isDirty: boolean;
    onDiscard?: () => void;
    enabled?: boolean;
};

export type UnsavedChangesContextValue = {
    requestLeave: () => Promise<boolean>;
    register: (options: {
        id?: symbol;
        scope: UnsavedChangesScope;
        isDirty: () => boolean;
        onDiscard?: () => void;
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
}: RegisterUnsavedChangesOptions): void {
    const { register } = useUnsavedChanges();
    const isDirtyRef = useRef(isDirty);
    const onDiscardRef = useRef(onDiscard);

    const reactId = useId();
    const stableIdRef = useRef<symbol | null>(null);

    if (!stableIdRef.current) {
        stableIdRef.current = Symbol(`unsavedChanges-${reactId}`);
    }

    // Sync during render so requestLeave never reads a stale pre-effect ref.
    isDirtyRef.current = isDirty;
    onDiscardRef.current = onDiscard;

    useEffect(() => {
        if (!enabled) {
            return;
        }

        return register({
            id: stableIdRef.current!,
            isDirty: () => isDirtyRef.current,
            onDiscard: () => onDiscardRef.current?.(),
            scope,
        });
    }, [enabled, register, scope]);
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

export type { UnsavedChangesEntry, UnsavedChangesScope };
