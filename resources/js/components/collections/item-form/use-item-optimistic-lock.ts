import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getItemFormElement } from '@/components/collections/item-form/item-form-helpers';
import { isRemoteUpdatedAtStale, notifyItemSaved } from '@/lib/item-presence';

/**
 * Optimistic locking of the item edit form. The form posts the
 * `updated_at` it was loaded with (`expected_updated_at`), so the server can
 * refuse to overwrite a newer save. When a peer editor has already saved
 * (their `updated_at` arrives through presence), submitting first asks the
 * user to reload or overwrite on purpose (#315).
 *
 * @param options.isNew - Create form: nothing to lock and nobody to notify.
 * @param options.updatedAt - The item's `updated_at` from the server props.
 * @param options.isDirty - While dirty, the baseline keeps the value the edits started from.
 * @param options.remoteUpdatedAt - Latest `updated_at` a peer editor announced.
 */
export function useItemOptimisticLock({
    isNew,
    updatedAt,
    isDirty,
    remoteUpdatedAt,
}: {
    isNew: boolean;
    updatedAt: string | null | undefined;
    isDirty: boolean;
    remoteUpdatedAt: string | null;
}): {
    expectedUpdatedAt: string;
    isRemoteStale: boolean;
    isStaleSaveOpen: boolean;
    setIsStaleSaveOpen: Dispatch<SetStateAction<boolean>>;
    saveAnyway: () => void;
} {
    const loadedUpdatedAtRef = useRef<string | null>(updatedAt ?? null);
    const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(updatedAt ?? '');
    const allowStaleSaveRef = useRef(false);
    const [isStaleSaveOpen, setIsStaleSaveOpen] = useState(false);
    const [previousBaseline, setPreviousBaseline] = useState({
        updatedAt,
        isDirty,
    });

    // Adopt a fresh server `updated_at` during render (React's "adjust state
    // on prop change" pattern), only while there are no unsaved edits.
    if (
        previousBaseline.updatedAt !== updatedAt ||
        previousBaseline.isDirty !== isDirty
    ) {
        setPreviousBaseline({ updatedAt, isDirty });

        if (!isDirty) {
            setExpectedUpdatedAt(updatedAt ?? '');
        }
    }

    // The stale-save guard reads this ref in a submit listener, so it follows
    // the committed baseline, like `expectedUpdatedAt` above.
    useEffect(() => {
        if (!isDirty) {
            loadedUpdatedAtRef.current = updatedAt ?? null;
        }
    }, [updatedAt, isDirty]);

    // Whisper fresh updated_at to peer editors after Inertia save refreshes props.
    // notifyItemSaved was previously unused — peers never saw the stale banner (#315).
    useEffect(() => {
        if (isNew || !updatedAt) {
            return;
        }

        const timer = window.setTimeout(() => {
            notifyItemSaved(updatedAt);
        }, 0);

        return () => window.clearTimeout(timer);
    }, [isNew, updatedAt]);

    useEffect(() => {
        const form = getItemFormElement();

        if (!form) {
            return;
        }

        const onSubmit = (event: SubmitEvent) => {
            if (allowStaleSaveRef.current) {
                allowStaleSaveRef.current = false;

                return;
            }

            const stale = isRemoteUpdatedAtStale(
                loadedUpdatedAtRef.current,
                remoteUpdatedAt,
            );

            if (!stale) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            setIsStaleSaveOpen(true);
        };

        form.addEventListener('submit', onSubmit, true);

        return () => {
            form.removeEventListener('submit', onSubmit, true);
        };
    }, [remoteUpdatedAt]);

    /** Overwrite the peer's save on purpose: adopt their token, then submit. */
    const saveAnyway = (): void => {
        // Align expected token with remote so server overwrite is intentional.
        if (remoteUpdatedAt) {
            setExpectedUpdatedAt(remoteUpdatedAt);
            loadedUpdatedAtRef.current = remoteUpdatedAt;
        } else {
            setExpectedUpdatedAt('');
        }

        allowStaleSaveRef.current = true;
        setIsStaleSaveOpen(false);
        queueMicrotask(() => {
            getItemFormElement()?.requestSubmit();
        });
    };

    return {
        expectedUpdatedAt,
        isRemoteStale: isRemoteUpdatedAtStale(
            expectedUpdatedAt || null,
            remoteUpdatedAt,
        ),
        isStaleSaveOpen,
        setIsStaleSaveOpen,
        saveAnyway,
    };
}
