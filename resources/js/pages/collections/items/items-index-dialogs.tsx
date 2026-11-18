import { useTranslation } from 'react-i18next';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import type { ItemRow } from '@/types';
import { itemLabel } from './items-index-helpers';
import type { ItemsListSelection } from './use-items-list-selection';

/**
 * Confirm dialogs of the items list: delete one item, bulk delete or force
 * delete the selection, and force delete one trashed item.
 */
export function ItemsIndexDialogs({
    rows,
    selection,
}: {
    rows: ItemRow[];
    selection: ItemsListSelection;
}) {
    const { t } = useTranslation();
    const {
        selected,
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
    } = selection;

    return (
        <>
            <ConfirmDestructiveDialog
                open={deleteItemId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteItemId(null);
                    }
                }}
                title={t('itemConfirm.deleteTitle', {
                    name: (() => {
                        const row = rows.find(
                            (item) => item.id === deleteItemId,
                        );

                        return (
                            (row ? itemLabel(row) : null) ??
                            `#${deleteItemId ?? ''}`
                        );
                    })(),
                })}
                description={t('itemConfirm.deleteDescription')}
                confirming={confirmingDestructive}
                onConfirm={confirmDelete}
            />

            <ConfirmDestructiveDialog
                open={pendingBulkAction !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingBulkAction(null);
                    }
                }}
                title={
                    pendingBulkAction === 'force_delete'
                        ? t('itemConfirm.bulkForceDeleteTitle', {
                              count: selected.length,
                          })
                        : t('itemConfirm.bulkDeleteTitle', {
                              count: selected.length,
                          })
                }
                description={
                    pendingBulkAction === 'force_delete'
                        ? t('itemConfirm.bulkForceDeleteDescription')
                        : t('itemConfirm.bulkDeleteDescription')
                }
                confirmLabel={
                    pendingBulkAction === 'force_delete'
                        ? t('confirmDestructive.deletePermanently')
                        : t('common.delete')
                }
                confirming={confirmingDestructive}
                onConfirm={confirmBulkAction}
            />

            <ConfirmDestructiveDialog
                open={pendingForceDeleteItemId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingForceDeleteItemId(null);
                    }
                }}
                title={t('itemConfirm.forceDeleteTitle', {
                    name: (() => {
                        const row = rows.find(
                            (item) => item.id === pendingForceDeleteItemId,
                        );

                        return (
                            (row ? itemLabel(row) : null) ??
                            `#${pendingForceDeleteItemId ?? ''}`
                        );
                    })(),
                })}
                description={t('itemConfirm.forceDeleteDescription')}
                confirmLabel={t('confirmDestructive.deletePermanently')}
                confirming={confirmingDestructive}
                onConfirm={confirmForceDelete}
            />
        </>
    );
}
