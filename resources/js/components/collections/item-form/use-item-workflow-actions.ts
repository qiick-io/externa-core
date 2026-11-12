import { router } from '@inertiajs/react';
import { useState } from 'react';
import ItemApprovalController from '@/actions/App/Http/Controllers/Collections/ItemApprovalController';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import ItemWorkflowController from '@/actions/App/Http/Controllers/Collections/ItemWorkflowController';

/**
 * Workflow requests of a saved item and their dialog / in-flight state:
 * approve, reject (with a note), submit for review, publish the draft,
 * discard the draft and delete. The version actions menu opens the dialogs;
 * the dialogs confirm and send the request.
 *
 * @param options.collectionId - Collection of the item.
 * @param options.itemId - The item (the actions only render for a saved item).
 */
export function useItemWorkflowActions({
    collectionId,
    itemId,
}: {
    collectionId: number;
    itemId: number;
}) {
    const [isApproving, setIsApproving] = useState(false);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [rejectNote, setRejectNote] = useState('');
    const [isPublishOpen, setIsPublishOpen] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isDiscardDraftOpen, setIsDiscardDraftOpen] = useState(false);
    const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const itemRoute = { collection: collectionId, item: itemId };

    const approve = (): void => {
        setIsApproving(true);
        router.post(
            ItemApprovalController.approve.url(itemRoute),
            {},
            {
                onFinish: () => setIsApproving(false),
            },
        );
    };

    const submitForReview = (): void => {
        setIsSubmittingReview(true);
        router.post(
            ItemApprovalController.submitForReview.url(itemRoute),
            {},
            {
                onFinish: () => setIsSubmittingReview(false),
            },
        );
    };

    /** Open the reject dialog, prefilled with the previous rejection note. */
    const openReject = (previousNote: string | null | undefined): void => {
        setRejectNote(previousNote ?? '');
        setIsRejectOpen(true);
    };

    /** Reject the draft; a note is required, so an empty one sends nothing. */
    const reject = (): void => {
        if (rejectNote.trim() === '') {
            return;
        }

        setIsRejecting(true);
        router.post(
            ItemApprovalController.reject.url(itemRoute),
            { rejection_note: rejectNote.trim() },
            {
                onFinish: () => {
                    setIsRejecting(false);
                    setIsRejectOpen(false);
                },
            },
        );
    };

    const publish = (): void => {
        setIsPublishing(true);
        router.post(
            ItemWorkflowController.publish.url(itemRoute),
            {},
            {
                onFinish: () => {
                    setIsPublishing(false);
                    setIsPublishOpen(false);
                },
            },
        );
    };

    const discardDraft = (): void => {
        setIsDiscardingDraft(true);
        router.post(
            ItemWorkflowController.discardDraft.url(itemRoute),
            {},
            {
                onFinish: () => {
                    setIsDiscardingDraft(false);
                    setIsDiscardDraftOpen(false);
                },
            },
        );
    };

    const deleteItem = (): void => {
        setIsDeleting(true);
        router.delete(ItemController.destroy.url(itemRoute), {
            onFinish: () => setIsDeleting(false),
            onError: () => setIsDeleteOpen(false),
        });
    };

    return {
        isApproving,
        isSubmittingReview,
        isRejectOpen,
        setIsRejectOpen,
        isRejecting,
        rejectNote,
        setRejectNote,
        isPublishOpen,
        setIsPublishOpen,
        isPublishing,
        isDiscardDraftOpen,
        setIsDiscardDraftOpen,
        isDiscardingDraft,
        isDeleteOpen,
        setIsDeleteOpen,
        isDeleting,
        approve,
        submitForReview,
        openReject,
        reject,
        publish,
        discardDraft,
        deleteItem,
    };
}

export type ItemWorkflowActions = ReturnType<typeof useItemWorkflowActions>;
