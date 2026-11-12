import { useEffect } from 'react';
import type { ItemSaveAction } from '@/components/collections/item-form/item-form-helpers';

/**
 * ⌘S / Ctrl+S saves the item form; with Shift it saves and opens a new item
 * (when the collection allows more than one). Ignored inside dialogs, so a
 * dialog's own form keeps the shortcut.
 *
 * @param options.isEnabled - Whether the form can be saved (editable, with fields).
 * @param options.showCreateNew - Whether "save and create new" exists for this collection.
 * @param options.submitSave - Submits the form with the given save action (stable).
 */
export function useItemSaveShortcut({
    isEnabled,
    showCreateNew,
    submitSave,
}: {
    isEnabled: boolean;
    showCreateNew: boolean;
    submitSave: (action: ItemSaveAction) => void;
}): void {
    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.isComposing || event.key.toLowerCase() !== 's') {
                return;
            }

            if (!(event.metaKey || event.ctrlKey)) {
                return;
            }

            if (
                (event.target as HTMLElement | null)?.closest('[role="dialog"]')
            ) {
                return;
            }

            event.preventDefault();
            submitSave(event.shiftKey && showCreateNew ? 'create_new' : 'stay');
        };

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isEnabled, showCreateNew, submitSave]);
}
