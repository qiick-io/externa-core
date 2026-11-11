import {
    createContext,
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import type {
    UnsavedChangesDialogCopy,
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
    // Written right after each commit (not during render), before any navigation event,
    // so requestLeave never reads a stale value.
    const isDirtyRef = useRef(isDirty);
    useLayoutEffect(() => {
        isDirtyRef.current = isDirty;
    });
    const onDiscardRef = useRef(onDiscard);
    useLayoutEffect(() => {
        onDiscardRef.current = onDiscard;
    });
    const dialogCopyRef = useRef(dialogCopy);
    useLayoutEffect(() => {
        dialogCopyRef.current = dialogCopy;
    });

    const reactId = useId();
    const [stableId] = useState(() => Symbol(`unsavedChanges-${reactId}`));

    useEffect(() => {
        notifyUnsavedChangesRegistry();
    }, [isDirty]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        return register({
            id: stableId,
            isDirty: () => isDirtyRef.current,
            onDiscard: () => onDiscardRef.current?.(),
            scope,
            dialogCopy: dialogCopyRef.current,
        });
    }, [enabled, register, scope, dialogCopy, stableId]);
}
