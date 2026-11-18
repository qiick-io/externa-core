import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getItemFormElement } from '@/components/collections/item-form/item-form-helpers';
import {
    applyItemDraftToForm,
    clearItemDraft,
    readItemDraft,
    serializeItemForm,
    writeItemDraft,
} from '@/lib/item-draft-storage';

const DRAFT_DEBOUNCE_MS = 800;

/**
 * Local (browser) draft of the item form: unsaved input survives a reload or
 * a crash. On mount the stored draft is written into the uncontrolled form and
 * the page is marked dirty; edits are written back, debounced, while typing.
 *
 * @param options.collectionId - Collection of the item.
 * @param options.draftItemKey - Item id, or `'new'` on the create form.
 * @param options.formKey - Remount key of the form; the draft is re-applied to a remounted form.
 * @param options.setIsDirty - The page's dirty-state setter (stable).
 */
export function useItemDraftAutosave({
    collectionId,
    draftItemKey,
    formKey,
    setIsDirty,
}: {
    collectionId: number;
    draftItemKey: number | 'new';
    formKey: number;
    setIsDirty: Dispatch<SetStateAction<boolean>>;
}): {
    isDraftRestored: boolean;
    scheduleDraftSave: () => void;
    clearDraft: () => void;
} {
    const initialDraft = useMemo(
        () => readItemDraft(collectionId, draftItemKey),
        // one-shot on mount for this item

        [collectionId, draftItemKey],
    );
    const [isDraftRestored, setIsDraftRestored] = useState(
        () => initialDraft !== null && Object.keys(initialDraft).length > 0,
    );
    const draftTimer = useRef<number | null>(null);

    useEffect(() => {
        if (!isDraftRestored || !initialDraft) {
            return;
        }

        const form = getItemFormElement();

        if (!form) {
            return;
        }

        applyItemDraftToForm(form, initialDraft);
        // The draft is written into the uncontrolled DOM form first; dirty only once that form exists and holds it.
        setIsDirty(true);
    }, [isDraftRestored, initialDraft, formKey, setIsDirty]);

    const scheduleDraftSave = (): void => {
        if (draftTimer.current) {
            window.clearTimeout(draftTimer.current);
        }

        draftTimer.current = window.setTimeout(() => {
            const form = getItemFormElement();

            if (!form) {
                return;
            }

            writeItemDraft(collectionId, draftItemKey, serializeItemForm(form));
        }, DRAFT_DEBOUNCE_MS);
    };

    useEffect(() => {
        return () => {
            if (draftTimer.current) {
                window.clearTimeout(draftTimer.current);
            }
        };
    }, []);

    /** Forget the stored draft and hide the "draft restored" banner. */
    const clearDraft = (): void => {
        clearItemDraft(collectionId, draftItemKey);
        setIsDraftRestored(false);
    };

    return { isDraftRestored, scheduleDraftSave, clearDraft };
}
