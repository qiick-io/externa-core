import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFileWhereUsed } from '@/lib/files-api';
import type { FileWhereUsedReference } from '@/lib/files-api';
import type { AdminFileRow } from '@/types/files';

/**
 * Collection items that reference a file, for the "where used" section of
 * the file detail panel. Folders are never scanned. The scan restarts when
 * the file id, its type or the language changes; a fresh copy of the same
 * file (after a save or replace) keeps the loaded references.
 * @param {AdminFileRow} file - File shown in the panel.
 */
export function useFileWhereUsed(file: AdminFileRow) {
    const { t } = useTranslation();
    const [whereUsedLoading, setWhereUsedLoading] = useState(
        file.type === 'file',
    );
    const [whereUsedError, setWhereUsedError] = useState<string | null>(null);
    const [whereUsedRefs, setWhereUsedRefs] = useState<
        FileWhereUsedReference[] | null
    >(null);
    const [previousWhereUsedScan, setPreviousWhereUsedScan] = useState({
        fileId: file.id,
        fileType: file.type,
        t,
    });

    // When another file (or type, or language) arrives, drop the old references
    // and mark the scan as loading during render (React's "adjust state on prop
    // change" pattern). A fresh copy of the same file keeps them.
    if (
        previousWhereUsedScan.fileId !== file.id ||
        previousWhereUsedScan.fileType !== file.type ||
        previousWhereUsedScan.t !== t
    ) {
        setPreviousWhereUsedScan({ fileId: file.id, fileType: file.type, t });
        setWhereUsedRefs(null);
        setWhereUsedError(null);

        if (file.type === 'file') {
            setWhereUsedLoading(true);
            setWhereUsedError(null);
        }
    }

    useEffect(() => {
        if (file.type !== 'file') {
            return;
        }

        let cancelled = false;

        void fetchFileWhereUsed(file.id)
            .then((result) => {
                if (!cancelled) {
                    setWhereUsedRefs(result.references);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setWhereUsedError(
                        error instanceof Error
                            ? error.message
                            : t('files.detail.failedScanRefs'),
                    );
                    setWhereUsedRefs([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setWhereUsedLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [file.id, file.type, t]);

    return { whereUsedLoading, whereUsedError, whereUsedRefs };
}
