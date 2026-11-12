import { useCallback, useEffect, useState } from 'react';
import { listFileTagsCatalog } from '@/lib/files-api';
import type { FileTag } from '@/types/files';

/**
 * Loads the project's file tag catalog for the tag filter and tag pickers.
 *
 * The catalog is best-effort: a failed load or refresh keeps the last known
 * tags, and the file list keeps working without it.
 */
export function useFileTagCatalog() {
    const [tagCatalog, setTagCatalog] = useState<FileTag[]>([]);

    useEffect(() => {
        let cancelled = false;

        void listFileTagsCatalog()
            .then((tags) => {
                if (!cancelled) {
                    setTagCatalog(tags);
                }
            })
            .catch(() => {
                // Catalog is best-effort for picker/filter; listing still works.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const refreshTagCatalog = useCallback(async (): Promise<void> => {
        try {
            setTagCatalog(await listFileTagsCatalog());
        } catch {
            // Ignore catalog refresh failures.
        }
    }, []);

    return { tagCatalog, refreshTagCatalog };
}
