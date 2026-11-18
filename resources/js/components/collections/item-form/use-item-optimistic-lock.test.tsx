import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { COLLECTION_ITEM_FORM_ID } from '@/components/collections/item-form/item-form-helpers';
import { useItemOptimisticLock } from '@/components/collections/item-form/use-item-optimistic-lock';
import type * as ItemPresenceModule from '@/lib/item-presence';

const notifyItemSaved = vi.hoisted(() => vi.fn());

vi.mock('@/lib/item-presence', async (importOriginal) => ({
    ...(await importOriginal<typeof ItemPresenceModule>()),
    notifyItemSaved,
}));

const LOADED_AT = '2026-11-01T10:00:00.000Z';
const PEER_SAVED_AT = '2026-11-01T10:05:00.000Z';

type LockProps = Parameters<typeof useItemOptimisticLock>[0];

function mountItemForm(): HTMLFormElement {
    const form = document.createElement('form');
    form.id = COLLECTION_ITEM_FORM_ID;
    form.requestSubmit = vi.fn();
    document.body.append(form);

    return form;
}

function submit(form: HTMLFormElement): SubmitEvent {
    const event = new SubmitEvent('submit', { cancelable: true });
    form.dispatchEvent(event);

    return event;
}

function renderLock(props: Partial<LockProps> = {}) {
    return renderHook(
        (hookProps: LockProps) => useItemOptimisticLock(hookProps),
        {
            initialProps: {
                isNew: false,
                updatedAt: LOADED_AT,
                isDirty: false,
                remoteUpdatedAt: null,
                ...props,
            },
        },
    );
}

describe('useItemOptimisticLock', () => {
    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        notifyItemSaved.mockClear();
    });

    it('lets the save through while nobody else saved', () => {
        const form = mountItemForm();
        const hook = renderLock();

        expect(submit(form).defaultPrevented).toBe(false);
        expect(hook.result.current.isStaleSaveOpen).toBe(false);
        expect(hook.result.current.isRemoteStale).toBe(false);
    });

    it('holds the save and asks when a peer saved a newer version', () => {
        const form = mountItemForm();
        const hook = renderLock({ remoteUpdatedAt: PEER_SAVED_AT });

        let event: SubmitEvent | undefined;
        act(() => {
            event = submit(form);
        });

        expect(event?.defaultPrevented).toBe(true);
        expect(hook.result.current.isStaleSaveOpen).toBe(true);
        expect(hook.result.current.isRemoteStale).toBe(true);
    });

    it('still holds a stale save after the form element remounts', () => {
        const firstForm = mountItemForm();
        const hook = renderLock({ remoteUpdatedAt: PEER_SAVED_AT });

        // Discard or fields → activity → fields replaces the form element.
        firstForm.remove();
        const remountedForm = mountItemForm();

        let event: SubmitEvent | undefined;
        act(() => {
            event = submit(remountedForm);
        });

        expect(event?.defaultPrevented).toBe(true);
        expect(hook.result.current.isStaleSaveOpen).toBe(true);
    });

    it('guards a form that mounts after the peer save arrived', () => {
        const hook = renderLock({ remoteUpdatedAt: PEER_SAVED_AT });
        const form = mountItemForm();

        let event: SubmitEvent | undefined;
        act(() => {
            event = submit(form);
        });

        expect(event?.defaultPrevented).toBe(true);
        expect(hook.result.current.isStaleSaveOpen).toBe(true);
    });

    it('ignores submits of other forms on the page', () => {
        mountItemForm();
        const otherForm = document.createElement('form');
        document.body.append(otherForm);
        const hook = renderLock({ remoteUpdatedAt: PEER_SAVED_AT });

        expect(submit(otherForm).defaultPrevented).toBe(false);
        expect(hook.result.current.isStaleSaveOpen).toBe(false);
    });

    it('overwrites on purpose with the peer token after "save anyway"', () => {
        const form = mountItemForm();
        const hook = renderLock({ remoteUpdatedAt: PEER_SAVED_AT });

        act(() => {
            submit(form);
        });
        act(() => {
            hook.result.current.saveAnyway();
        });

        expect(hook.result.current.isStaleSaveOpen).toBe(false);
        expect(hook.result.current.expectedUpdatedAt).toBe(PEER_SAVED_AT);
        expect(submit(form).defaultPrevented).toBe(false);
    });

    it('adopts a new server updated_at only while there are no unsaved edits', () => {
        mountItemForm();
        const hook = renderLock({ isDirty: true });
        const savedAgainAt = '2026-11-01T11:00:00.000Z';

        hook.rerender({
            isNew: false,
            updatedAt: savedAgainAt,
            isDirty: true,
            remoteUpdatedAt: null,
        });
        expect(hook.result.current.expectedUpdatedAt).toBe(LOADED_AT);

        hook.rerender({
            isNew: false,
            updatedAt: savedAgainAt,
            isDirty: false,
            remoteUpdatedAt: null,
        });
        expect(hook.result.current.expectedUpdatedAt).toBe(savedAgainAt);
    });

    it('announces the saved updated_at to peer editors', () => {
        vi.useFakeTimers();
        renderLock();

        act(() => {
            vi.runAllTimers();
        });
        vi.useRealTimers();

        expect(notifyItemSaved).toHaveBeenCalledWith(LOADED_AT);
    });
});
