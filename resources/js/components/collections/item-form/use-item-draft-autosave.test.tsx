import { act, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { COLLECTION_ITEM_FORM_ID } from '@/components/collections/item-form/item-form-helpers';
import { useItemDraftAutosave } from '@/components/collections/item-form/use-item-draft-autosave';

const DRAFT_STORAGE_KEY = 'externa:item-draft:7:42';

function mountItemForm(): HTMLInputElement {
    const form = document.createElement('form');
    form.id = COLLECTION_ITEM_FORM_ID;
    const titleInput = document.createElement('input');
    titleInput.name = 'data[title]';
    titleInput.value = 'Saved title';
    form.append(titleInput);
    document.body.append(form);

    return titleInput;
}

function renderDraftAutosave(setIsDirty = vi.fn()) {
    const hook = renderHook(() =>
        useItemDraftAutosave({
            collectionId: 7,
            draftItemKey: 42,
            formKey: 0,
            setIsDirty,
        }),
    );

    return { hook, setIsDirty };
}

describe('useItemDraftAutosave', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('restores a stored draft into the form and marks the page dirty', () => {
        const titleInput = mountItemForm();
        localStorage.setItem(
            DRAFT_STORAGE_KEY,
            JSON.stringify({ 'data[title]': 'Unsaved title' }),
        );

        const { hook, setIsDirty } = renderDraftAutosave();

        expect(hook.result.current.isDraftRestored).toBe(true);
        expect(titleInput.value).toBe('Unsaved title');
        expect(setIsDirty).toHaveBeenCalledWith(true);
    });

    it('leaves the form and dirty state alone without a stored draft', () => {
        const titleInput = mountItemForm();

        const { hook, setIsDirty } = renderDraftAutosave();

        expect(hook.result.current.isDraftRestored).toBe(false);
        expect(titleInput.value).toBe('Saved title');
        expect(setIsDirty).not.toHaveBeenCalled();
    });

    it('writes the form to storage once typing pauses', () => {
        vi.useFakeTimers();
        const titleInput = mountItemForm();
        const { hook } = renderDraftAutosave();

        titleInput.value = 'First';
        act(() => {
            hook.result.current.scheduleDraftSave();
        });
        titleInput.value = 'Second';
        act(() => {
            hook.result.current.scheduleDraftSave();
        });

        act(() => {
            vi.advanceTimersByTime(799);
        });
        expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(
            JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}'),
        ).toEqual({ 'data[title]': 'Second' });
    });

    it('drops the stored draft and the restored notice on clear', () => {
        mountItemForm();
        localStorage.setItem(
            DRAFT_STORAGE_KEY,
            JSON.stringify({ 'data[title]': 'Unsaved title' }),
        );
        const { hook } = renderDraftAutosave();

        act(() => {
            hook.result.current.clearDraft();
        });

        expect(hook.result.current.isDraftRestored).toBe(false);
        expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    });
});
