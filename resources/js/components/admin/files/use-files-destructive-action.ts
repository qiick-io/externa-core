import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    bulkFileAction,
    deleteFile,
    fetchFileWhereUsed,
    forceDeleteFile,
} from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { AdminFileRow } from '@/types/files';

type PendingDestructiveAction = {
    action: 'delete' | 'force_delete';
    targets: AdminFileRow[];
};

/**
 * Holds a delete or permanent delete until the user confirms it, and counts
 * where the files are still used so the confirmation can warn about it.
 *
 * References are only looked up for up to ten plain files (folders are
 * skipped) to keep the dialog fast; a failed lookup counts as zero.
 * `onDeleted` runs after a successful delete, before the dialog closes.
 */
export function useFilesDestructiveAction(onDeleted: () => void) {
    const { t } = useTranslation();
    const [pendingDestructive, setPendingDestructive] =
        useState<PendingDestructiveAction | null>(null);
    const [destructiveRefCount, setDestructiveRefCount] = useState(0);
    const [isDestructiveRefLoading, setIsDestructiveRefLoading] =
        useState(false);
    const [isConfirmingDestructive, setIsConfirmingDestructive] =
        useState(false);

    const requestDestructive = useCallback(
        (
            action: PendingDestructiveAction['action'],
            selected: AdminFileRow[],
        ): void => {
            setPendingDestructive({ action, targets: selected });
            setDestructiveRefCount(0);
            const fileTargets = selected.filter((file) => file.type === 'file');

            if (fileTargets.length > 0 && fileTargets.length <= 10) {
                setIsDestructiveRefLoading(true);
                void Promise.all(
                    fileTargets.map((file) =>
                        fetchFileWhereUsed(file.id)
                            .then((whereUsed) => whereUsed.count)
                            .catch(() => 0),
                    ),
                )
                    .then((counts) => {
                        setDestructiveRefCount(
                            counts.reduce((sum, count) => sum + count, 0),
                        );
                    })
                    .finally(() => setIsDestructiveRefLoading(false));
            }
        },
        [],
    );

    const cancelDestructive = (): void => {
        setPendingDestructive(null);
        setDestructiveRefCount(0);
        setIsDestructiveRefLoading(false);
    };

    const executePendingDestructive = async (): Promise<void> => {
        if (!pendingDestructive) {
            return;
        }

        const { action, targets } = pendingDestructive;
        const ids = targets.map((file) => file.id);

        setIsConfirmingDestructive(true);

        try {
            if (action === 'delete') {
                if (ids.length === 1) {
                    await deleteFile(ids[0]);
                } else {
                    await bulkFileAction('delete', ids);
                }

                onDeleted();
            } else {
                if (ids.length === 1) {
                    await forceDeleteFile(ids[0]);
                } else {
                    await bulkFileAction('force_delete', ids);
                }

                onDeleted();
            }

            setPendingDestructive(null);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.toasts.actionFailed'),
            );
        } finally {
            setIsConfirmingDestructive(false);
        }
    };

    return {
        pendingDestructive,
        destructiveRefCount,
        isDestructiveRefLoading,
        isConfirmingDestructive,
        requestDestructive,
        cancelDestructive,
        executePendingDestructive,
    };
}

export type FilesDestructiveAction = ReturnType<
    typeof useFilesDestructiveAction
>;
