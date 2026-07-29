import type { PendingVisit } from '@inertiajs/core';
import { router } from '@inertiajs/react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import { UnsavedChangesDialog } from '@/components/unsaved-changes-dialog';
import { UnsavedChangesContext } from '@/hooks/use-unsaved-changes';
import type { UnsavedChangesContextValue } from '@/hooks/use-unsaved-changes';
import {
    getActiveUnsavedChangesEntry,
    hasUnsavedChangesInRegistry,
    registerUnsavedChangesEntry,
} from '@/lib/unsaved-changes/registry';
import type { UnsavedChangesScope } from '@/lib/unsaved-changes/registry';

type Props = {
    children: ReactNode;
};

/**
 * Mount once in the app shell: dirty registry confirm + Inertia GET leave guard + beforeunload.
 *
 * ponytail: Inertia cannot block browser back/forward (popstate) — only Link/router.visit GET and beforeunload.
 */
export function UnsavedChangesProvider({ children }: Props) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const pendingConfirmationRef = useRef<Promise<boolean> | null>(null);
    const resolveDialogRef = useRef<((leave: boolean) => void) | null>(null);
    const allowNextRef = useRef(false);
    const pendingVisitRef = useRef<PendingVisit | null>(null);

    const showConfirmDialog = useCallback((): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            resolveDialogRef.current = resolve;
            setDialogOpen(true);
        });
    }, []);

    const settleDialog = useCallback((leave: boolean) => {
        setDialogOpen(false);
        resolveDialogRef.current?.(leave);
        resolveDialogRef.current = null;
    }, []);

    const requestLeave = useCallback(async (): Promise<boolean> => {
        const activeEntry = getActiveUnsavedChangesEntry();

        if (!activeEntry) {
            return true;
        }

        if (pendingConfirmationRef.current) {
            return pendingConfirmationRef.current;
        }

        const confirmationPromise = (async () => {
            const confirmed = await showConfirmDialog();

            if (confirmed) {
                // Ignore nested GET visits from onDiscard (e.g. accidental router.reload()).
                allowNextRef.current = true;
                try {
                    activeEntry.onDiscard?.();
                } finally {
                    allowNextRef.current = false;
                }
            }

            return confirmed;
        })();

        pendingConfirmationRef.current = confirmationPromise;

        try {
            return await confirmationPromise;
        } finally {
            pendingConfirmationRef.current = null;
        }
    }, [showConfirmDialog]);

    const register = useCallback(
        (options: {
            id?: symbol;
            scope: UnsavedChangesScope;
            isDirty: () => boolean;
            onDiscard?: () => void;
        }): (() => void) => {
            const registrationId =
                options.id ?? Symbol('unsavedChangesRegistration');

            return registerUnsavedChangesEntry({
                id: registrationId,
                isDirty: options.isDirty,
                onDiscard: options.onDiscard,
                scope: options.scope,
            });
        },
        [],
    );

    const replayPendingVisit = useCallback((visit: PendingVisit) => {
        allowNextRef.current = true;
        pendingVisitRef.current = null;

        router.visit(visit.url.href, {
            method: visit.method,
            data: visit.data,
            replace: visit.replace,
            preserveScroll: visit.preserveScroll,
            preserveState: visit.preserveState,
            only: visit.only,
            except: visit.except,
            headers: visit.headers,
            errorBag: visit.errorBag ?? undefined,
            forceFormData: visit.forceFormData,
            queryStringArrayFormat: visit.queryStringArrayFormat,
            async: visit.async,
            showProgress: visit.showProgress,
            prefetch: visit.prefetch,
            fresh: visit.fresh,
            reset: visit.reset,
            preserveUrl: visit.preserveUrl,
            invalidateCacheTags: visit.invalidateCacheTags,
            viewTransition: visit.viewTransition,
        });
    }, []);

    useEffect(() => {
        const removeBefore = router.on('before', (event) => {
            const visit = event.detail.visit;

            if (allowNextRef.current) {
                allowNextRef.current = false;

                return;
            }

            // Allow form submits (POST/PUT/PATCH/DELETE); only guard GET navigations.
            if (visit.method !== 'get') {
                return;
            }

            if (!hasUnsavedChangesInRegistry()) {
                return;
            }

            event.preventDefault();
            // Snapshot: onDiscard must not overwrite the intended leave target.
            pendingVisitRef.current = visit;
            const leaveVisit = visit;

            void requestLeave().then((ok) => {
                pendingVisitRef.current = null;

                if (ok) {
                    replayPendingVisit(leaveVisit);
                }
            });
        });

        const onBeforeUnload = (event: BeforeUnloadEvent): void => {
            if (!hasUnsavedChangesInRegistry()) {
                return;
            }

            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
            removeBefore();
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [replayPendingVisit, requestLeave]);

    const value = useMemo<UnsavedChangesContextValue>(
        () => ({
            requestLeave,
            register,
        }),
        [register, requestLeave],
    );

    return (
        <UnsavedChangesContext.Provider value={value}>
            {children}
            <UnsavedChangesDialog
                open={dialogOpen}
                onKeepEditing={() => settleDialog(false)}
                onDiscard={() => settleDialog(true)}
            />
        </UnsavedChangesContext.Provider>
    );
}
