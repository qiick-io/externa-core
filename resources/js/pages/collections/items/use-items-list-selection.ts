import { router } from '@inertiajs/react';
import { useState } from 'react';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import ItemTrashController from '@/actions/App/Http/Controllers/Collections/ItemTrashController';
import type { ItemRow } from '@/types';

/**
 * Row selection and the destructive actions of a collection's items page:
 * bulk restore / delete / force delete, single delete and single force delete,
 * each behind its confirm dialog. The selection clears when the collection or
 * the trash view changes.
 */
export function useItemsListSelection(
    collectionId: number,
    rows: ItemRow[],
    isTrashed: boolean,
) {
    const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
    const [pendingBulkAction, setPendingBulkAction] = useState<
        'delete' | 'force_delete' | null
    >(null);
    const [pendingForceDeleteItemId, setPendingForceDeleteItemId] = useState<
        number | null
    >(null);
    const [confirmingDestructive, setConfirmingDestructive] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);

    const [previousSelectionScope, setPreviousSelectionScope] = useState({
        isTrashed,
        collectionId,
    });

    // Clear the selection during render when switching collection or trash view.
    if (
        previousSelectionScope.isTrashed !== isTrashed ||
        previousSelectionScope.collectionId !== collectionId
    ) {
        setPreviousSelectionScope({ isTrashed, collectionId });
        setSelected([]);
    }

    const toggleAll = (checked: boolean): void => {
        setSelected(checked ? rows.map((row) => row.id) : []);
    };

    const toggleRow = (id: number): void => {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
        );
    };

    const bulk = (action: 'delete' | 'restore' | 'force_delete'): void => {
        router.post(
            ItemTrashController.bulk.url(collectionId),
            { ids: selected, action },
            {
                preserveScroll: true,
                onSuccess: () => setSelected([]),
            },
        );
    };

    const confirmDelete = (): void => {
        if (deleteItemId === null) {
            return;
        }

        setConfirmingDestructive(true);
        router.delete(
            ItemController.destroy.url({
                collection: collectionId,
                item: deleteItemId,
            }),
            {
                preserveScroll: true,
                onFinish: () => setConfirmingDestructive(false),
                onSuccess: () => setDeleteItemId(null),
                onError: () => setDeleteItemId(null),
            },
        );
    };

    const confirmBulkAction = (): void => {
        if (pendingBulkAction === null) {
            return;
        }

        setConfirmingDestructive(true);
        router.post(
            ItemTrashController.bulk.url(collectionId),
            { ids: selected, action: pendingBulkAction },
            {
                preserveScroll: true,
                onFinish: () => setConfirmingDestructive(false),
                onSuccess: () => {
                    setSelected([]);
                    setPendingBulkAction(null);
                },
                onError: () => setPendingBulkAction(null),
            },
        );
    };

    const confirmForceDelete = (): void => {
        if (pendingForceDeleteItemId === null) {
            return;
        }

        setConfirmingDestructive(true);
        router.delete(
            ItemTrashController.forceDelete.url({
                collection: collectionId,
                item: pendingForceDeleteItemId,
            }),
            {
                preserveScroll: true,
                onFinish: () => setConfirmingDestructive(false),
                onSuccess: () => setPendingForceDeleteItemId(null),
                onError: () => setPendingForceDeleteItemId(null),
            },
        );
    };

    return {
        selected,
        setSelected,
        toggleAll,
        toggleRow,
        bulk,
        deleteItemId,
        setDeleteItemId,
        pendingBulkAction,
        setPendingBulkAction,
        pendingForceDeleteItemId,
        setPendingForceDeleteItemId,
        confirmingDestructive,
        confirmDelete,
        confirmBulkAction,
        confirmForceDelete,
    };
}

export type ItemsListSelection = ReturnType<typeof useItemsListSelection>;
