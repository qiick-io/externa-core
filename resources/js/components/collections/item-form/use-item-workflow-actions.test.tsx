import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import ItemApprovalController from '@/actions/App/Http/Controllers/Collections/ItemApprovalController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import ItemWorkflowController from '@/actions/App/Http/Controllers/Collections/ItemWorkflowController';
import { useItemWorkflowActions } from '@/components/collections/item-form/use-item-workflow-actions';

const routerPost = vi.hoisted(() => vi.fn());
const routerDelete = vi.hoisted(() => vi.fn());

vi.mock('@inertiajs/react', () => ({
    router: { post: routerPost, delete: routerDelete },
}));

const itemRoute = { collection: 7, item: 42 };

function renderWorkflow() {
    return renderHook(() =>
        useItemWorkflowActions({ collectionId: 7, itemId: 42 }),
    );
}

describe('useItemWorkflowActions', () => {
    afterEach(() => {
        routerPost.mockReset();
        routerDelete.mockReset();
    });

    it('approves and submits for review through the approval routes', () => {
        const hook = renderWorkflow();

        act(() => {
            hook.result.current.approve();
        });
        act(() => {
            hook.result.current.submitForReview();
        });

        expect(routerPost.mock.calls.map((call) => call[0])).toEqual([
            ItemApprovalController.approve.url(itemRoute),
            ItemApprovalController.submitForReview.url(itemRoute),
        ]);
        expect(hook.result.current.isApproving).toBe(true);
        expect(hook.result.current.isSubmittingReview).toBe(true);
    });

    it('rejects only with a note, prefilled from the previous one', () => {
        const hook = renderWorkflow();

        act(() => {
            hook.result.current.openReject(null);
        });
        expect(hook.result.current.isRejectOpen).toBe(true);
        act(() => {
            hook.result.current.reject();
        });
        expect(routerPost).not.toHaveBeenCalled();

        act(() => {
            hook.result.current.openReject('  Fix the title  ');
        });
        act(() => {
            hook.result.current.reject();
        });

        expect(routerPost).toHaveBeenCalledWith(
            ItemApprovalController.reject.url(itemRoute),
            { rejection_note: 'Fix the title' },
            expect.any(Object),
        );

        act(() => {
            routerPost.mock.calls[0][2].onFinish();
        });
        expect(hook.result.current.isRejectOpen).toBe(false);
        expect(hook.result.current.isRejecting).toBe(false);
    });

    it('publishes and discards the draft, closing the dialog when done', () => {
        const hook = renderWorkflow();

        act(() => {
            hook.result.current.setIsPublishOpen(true);
        });
        act(() => {
            hook.result.current.publish();
        });
        expect(routerPost).toHaveBeenLastCalledWith(
            ItemWorkflowController.publish.url(itemRoute),
            {},
            expect.any(Object),
        );
        act(() => {
            routerPost.mock.lastCall?.[2].onFinish();
        });
        expect(hook.result.current.isPublishOpen).toBe(false);

        act(() => {
            hook.result.current.setIsDiscardDraftOpen(true);
        });
        act(() => {
            hook.result.current.discardDraft();
        });
        expect(routerPost).toHaveBeenLastCalledWith(
            ItemWorkflowController.discardDraft.url(itemRoute),
            {},
            expect.any(Object),
        );
        act(() => {
            routerPost.mock.lastCall?.[2].onFinish();
        });
        expect(hook.result.current.isDiscardDraftOpen).toBe(false);
    });

    it('deletes the item and closes the dialog only on error', () => {
        const hook = renderWorkflow();

        act(() => {
            hook.result.current.setIsDeleteOpen(true);
        });
        act(() => {
            hook.result.current.deleteItem();
        });

        expect(routerDelete).toHaveBeenCalledWith(
            ItemController.destroy.url(itemRoute),
            expect.any(Object),
        );
        act(() => {
            routerDelete.mock.calls[0][1].onFinish();
        });
        expect(hook.result.current.isDeleting).toBe(false);
        expect(hook.result.current.isDeleteOpen).toBe(true);

        act(() => {
            routerDelete.mock.calls[0][1].onError();
        });
        expect(hook.result.current.isDeleteOpen).toBe(false);
    });
});
