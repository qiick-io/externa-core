import { router } from '@inertiajs/react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemPayload } from '@/components/collections/item-form/item-form-helpers';
import type { ItemWorkflowActions } from '@/components/collections/item-form/use-item-workflow-actions';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/**
 * Asked before saving over a newer save by another editor: reload their
 * version, or overwrite it on purpose.
 */
export function ItemStaleSaveDialog({
    open,
    onOpenChange,
    onSaveAnyway,
}: {
    open: boolean;
    onOpenChange: Dispatch<SetStateAction<boolean>>;
    onSaveAnyway: () => void;
}) {
    const { t } = useTranslation();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.itemPresence.staleTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('collections.itemPresence.staleDescription')}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            onOpenChange(false);
                            router.reload();
                        }}
                    >
                        {t('collections.itemPresence.staleReload')}
                    </Button>
                    <Button type="button" onClick={onSaveAnyway}>
                        {t('collections.itemPresence.staleSave')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Confirmations of the item's workflow requests: delete, and on versioned
 * collections reject (with a required note), publish and discard the draft.
 */
export function ItemWorkflowDialogs({
    item,
    versioningEnabled,
    approvalStatus,
    workflow,
}: {
    item: ItemPayload;
    versioningEnabled: boolean;
    approvalStatus: string;
    workflow: ItemWorkflowActions;
}) {
    const { t } = useTranslation();

    return (
        <>
            <ConfirmDestructiveDialog
                open={workflow.isDeleteOpen}
                onOpenChange={workflow.setIsDeleteOpen}
                title={t('itemConfirm.deleteTitle', {
                    name: `#${item.id}`,
                })}
                description={t('itemConfirm.deleteDescription')}
                confirming={workflow.isDeleting}
                onConfirm={workflow.deleteItem}
            />

            {versioningEnabled && (
                <ConfirmDestructiveDialog
                    open={workflow.isRejectOpen}
                    onOpenChange={workflow.setIsRejectOpen}
                    title={t('itemConfirm.rejectDraftTitle', {
                        name: `#${item.id}`,
                    })}
                    description={
                        <div className="grid gap-2 pt-1 text-left">
                            <p className="text-sm text-muted-foreground">
                                {t('collections.items.form.rejectHint')}
                            </p>
                            <Textarea
                                className="min-h-24"
                                value={workflow.rejectNote}
                                onChange={(event) =>
                                    workflow.setRejectNote(event.target.value)
                                }
                                data-test="rejection-note"
                                placeholder={t(
                                    'collections.items.form.rejectionNote',
                                )}
                            />
                            {item.rejection_note &&
                            approvalStatus === 'rejected' ? (
                                <p className="text-xs text-muted-foreground">
                                    {t('collections.items.form.previousNote', {
                                        note: item.rejection_note,
                                    })}
                                </p>
                            ) : null}
                        </div>
                    }
                    confirmLabel={t('collections.itemToolbar.reject')}
                    confirming={workflow.isRejecting}
                    onConfirm={workflow.reject}
                />
            )}

            {versioningEnabled && (
                <ConfirmDestructiveDialog
                    open={workflow.isPublishOpen}
                    onOpenChange={workflow.setIsPublishOpen}
                    title={t('itemConfirm.publishDraftTitle', {
                        name: `#${item.id}`,
                    })}
                    description={t('itemConfirm.publishDraftDescription')}
                    confirmLabel={t('collections.itemToolbar.publish')}
                    confirming={workflow.isPublishing}
                    onConfirm={workflow.publish}
                />
            )}

            {versioningEnabled && (
                <ConfirmDestructiveDialog
                    open={workflow.isDiscardDraftOpen}
                    onOpenChange={workflow.setIsDiscardDraftOpen}
                    title={t('itemConfirm.discardDraftTitle', {
                        name: `#${item.id}`,
                    })}
                    description={t('itemConfirm.discardDraftDescription')}
                    confirmLabel={t('collections.itemToolbar.discardDraft')}
                    confirming={workflow.isDiscardingDraft}
                    onConfirm={workflow.discardDraft}
                />
            )}
        </>
    );
}
