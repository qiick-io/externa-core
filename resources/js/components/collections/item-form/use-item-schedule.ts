import { router } from '@inertiajs/react';
import { useState } from 'react';
import ItemWorkflowController from '@/actions/App/Http/Controllers/Collections/ItemWorkflowController';
import { fromDatetimeLocalValue } from '@/components/collections/item-form/item-form-helpers';
import { toDatetimeLocalValue } from '@/lib/format';

/**
 * Publish / unpublish schedule of a versioned item: the two date inputs
 * (kept on the page, so switching to the activity view and back keeps what
 * was typed) and the save / clear requests. On the published version only
 * the unpublish date is editable.
 *
 * @param options.collectionId - Collection of the item.
 * @param options.itemId - The item (the schedule panel only renders for a saved item).
 * @param options.publishAt - Saved `publish_at`, re-adopted whenever the server sends a new one.
 * @param options.unpublishAt - Saved `unpublish_at`, re-adopted likewise.
 * @param options.contentVersion - Version shown, sent as `?version=`.
 * @param options.isViewingPublished - Whether the published version is shown.
 */
export function useItemSchedule({
    collectionId,
    itemId,
    publishAt,
    unpublishAt,
    contentVersion,
    isViewingPublished,
}: {
    collectionId: number;
    itemId: number;
    publishAt: string | null | undefined;
    unpublishAt: string | null | undefined;
    contentVersion: 'published' | 'draft';
    isViewingPublished: boolean;
}): {
    publishAtLocal: string;
    setPublishAtLocal: (value: string) => void;
    unpublishAtLocal: string;
    setUnpublishAtLocal: (value: string) => void;
    isScheduling: boolean;
    saveSchedule: () => void;
    clearSchedule: () => void;
} {
    const [isScheduling, setIsScheduling] = useState(false);
    const [publishAtLocal, setPublishAtLocal] = useState(() =>
        toDatetimeLocalValue(publishAt ?? null),
    );
    const [unpublishAtLocal, setUnpublishAtLocal] = useState(() =>
        toDatetimeLocalValue(unpublishAt ?? null),
    );
    const [previousSchedule, setPreviousSchedule] = useState({
        publishAt,
        unpublishAt,
    });

    // Adopt the saved schedule during render (React's "adjust state on prop
    // change" pattern) when the server sends a new one.
    if (
        previousSchedule.publishAt !== publishAt ||
        previousSchedule.unpublishAt !== unpublishAt
    ) {
        setPreviousSchedule({ publishAt, unpublishAt });
        setPublishAtLocal(toDatetimeLocalValue(publishAt ?? null));
        setUnpublishAtLocal(toDatetimeLocalValue(unpublishAt ?? null));
    }

    const scheduleUrl = ItemWorkflowController.schedule.url(
        { collection: collectionId, item: itemId },
        { query: { version: contentVersion } },
    );

    /** Save the schedule; the published version only carries `unpublish_at`. */
    const saveSchedule = (): void => {
        setIsScheduling(true);
        const payload = isViewingPublished
            ? {
                  unpublish_at: unpublishAtLocal
                      ? fromDatetimeLocalValue(unpublishAtLocal)
                      : null,
              }
            : {
                  publish_at: publishAtLocal
                      ? fromDatetimeLocalValue(publishAtLocal)
                      : null,
                  unpublish_at: unpublishAtLocal
                      ? fromDatetimeLocalValue(unpublishAtLocal)
                      : null,
              };
        router.post(scheduleUrl, payload, {
            onFinish: () => setIsScheduling(false),
        });
    };

    /** Remove the saved schedule. */
    const clearSchedule = (): void => {
        setIsScheduling(true);
        router.post(
            scheduleUrl,
            { clear: true },
            {
                onFinish: () => setIsScheduling(false),
            },
        );
    };

    return {
        publishAtLocal,
        setPublishAtLocal,
        unpublishAtLocal,
        setUnpublishAtLocal,
        isScheduling,
        saveSchedule,
        clearSchedule,
    };
}
