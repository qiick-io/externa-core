import { useTranslation } from 'react-i18next';
import type { FilesDestructiveAction } from '@/components/admin/files/use-files-destructive-action';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';

/**
 * Confirmation for a pending delete or permanent delete in the file manager,
 * with the singular/plural copy and the "still referenced" warning.
 */
export function FilesDestructiveDialog({
    destructive,
}: {
    destructive: FilesDestructiveAction;
}) {
    const { t } = useTranslation();
    const {
        pendingDestructive,
        destructiveRefCount,
        isDestructiveRefLoading,
        isConfirmingDestructive,
    } = destructive;
    const destructiveCount = pendingDestructive?.targets.length ?? 0;
    const destructiveIsForce = pendingDestructive?.action === 'force_delete';

    return (
        <ConfirmDestructiveDialog
            open={pendingDestructive !== null}
            onOpenChange={(open) => {
                if (!open) {
                    destructive.cancelDestructive();
                }
            }}
            title={
                destructiveIsForce
                    ? destructiveCount === 1
                        ? t('files.delete.titleForceOne')
                        : t('files.delete.titleForceMany', {
                              count: destructiveCount,
                          })
                    : destructiveCount === 1
                      ? t('files.delete.titleOne')
                      : t('files.delete.titleMany', {
                            count: destructiveCount,
                        })
            }
            description={
                <>
                    {destructiveIsForce
                        ? destructiveCount === 1
                            ? t('files.delete.descForceOne')
                            : t('files.delete.descForceMany')
                        : destructiveCount === 1
                          ? t('files.delete.descOne')
                          : t('files.delete.descMany')}
                    {isDestructiveRefLoading && (
                        <> {t('files.delete.scanningRefs')}</>
                    )}
                    {!isDestructiveRefLoading && destructiveRefCount > 0 && (
                        <>
                            {' '}
                            {t('files.delete.referencedBy', {
                                count: destructiveRefCount,
                            })}
                        </>
                    )}
                </>
            }
            confirmLabel={
                destructiveIsForce
                    ? destructiveRefCount > 0
                        ? t('files.delete.confirmPermanentAnyway')
                        : t('files.delete.confirmPermanent')
                    : destructiveRefCount > 0
                      ? t('files.delete.confirmAnyway')
                      : t('common.delete')
            }
            confirming={isConfirmingDestructive}
            onConfirm={() => {
                void destructive.executePendingDestructive();
            }}
        />
    );
}
