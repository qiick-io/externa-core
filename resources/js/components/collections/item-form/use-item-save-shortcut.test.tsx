import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useItemSaveShortcut } from '@/components/collections/item-form/use-item-save-shortcut';

function pressSave(
    options: KeyboardEventInit = {},
    target: EventTarget = document.body,
): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
        bubbles: true,
        cancelable: true,
        ...options,
    });
    target.dispatchEvent(event);

    return event;
}

describe('useItemSaveShortcut', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('saves on ⌘S / Ctrl+S and saves and creates new with Shift', () => {
        const submitSave = vi.fn();
        renderHook(() =>
            useItemSaveShortcut({
                isEnabled: true,
                showCreateNew: true,
                submitSave,
            }),
        );

        expect(pressSave().defaultPrevented).toBe(true);
        pressSave({ metaKey: false, ctrlKey: true, shiftKey: true });

        expect(submitSave.mock.calls).toEqual([['stay'], ['create_new']]);
    });

    it('saves and stays with Shift when the collection is a singleton', () => {
        const submitSave = vi.fn();
        renderHook(() =>
            useItemSaveShortcut({
                isEnabled: true,
                showCreateNew: false,
                submitSave,
            }),
        );

        pressSave({ shiftKey: true });

        expect(submitSave).toHaveBeenCalledWith('stay');
    });

    it('ignores the shortcut inside dialogs, without modifier or when disabled', () => {
        const submitSave = vi.fn();
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        const dialogInput = document.createElement('input');
        dialog.append(dialogInput);
        document.body.append(dialog);
        const hook = renderHook(
            ({ isEnabled }: { isEnabled: boolean }) =>
                useItemSaveShortcut({
                    isEnabled,
                    showCreateNew: true,
                    submitSave,
                }),
            { initialProps: { isEnabled: true } },
        );

        pressSave({}, dialogInput);
        pressSave({ metaKey: false });
        hook.rerender({ isEnabled: false });
        pressSave();

        expect(submitSave).not.toHaveBeenCalled();
    });
});
