import { useCallback, useEffect, useRef, useState } from 'react';
import { getQueryParam, patchLocationQuery } from '@/lib/admin-query-params';
import { fetchFilesByIds } from '@/lib/files-api';
import type { AdminFileRow } from '@/types/files';

/**
 * Owns the file shown in the file manager's details panel and keeps it in the
 * `?file=` query parameter, so a details view can be linked and reloaded.
 *
 * On first render (outside the trash) it opens the file named in the URL, from
 * the rows on screen or fetched by id; an unknown id is removed from the URL.
 */
export function useFileDetails(
    files: AdminFileRow[],
    isTrashed: boolean,
    selectOnly: (fileId: number) => void,
) {
    const [detailFile, setDetailFile] = useState<AdminFileRow | null>(null);

    const openFileDetails = useCallback(
        (file: AdminFileRow): void => {
            setDetailFile(file);
            selectOnly(file.id);
            patchLocationQuery({ file: String(file.id) });
        },
        [selectOnly],
    );

    const closeFileDetails = (): void => {
        setDetailFile(null);
        patchLocationQuery({ file: null });
    };

    const fileDeepLinkBooted = useRef(false);

    useEffect(() => {
        if (fileDeepLinkBooted.current || isTrashed) {
            return;
        }

        fileDeepLinkBooted.current = true;
        const raw = getQueryParam(
            window.location.pathname + window.location.search,
            'file',
        );
        const id = raw ? Number.parseInt(raw, 10) : NaN;

        if (!Number.isFinite(id) || id <= 0) {
            return;
        }

        const local = files.find((file) => file.id === id);

        if (local) {
            setDetailFile(local);
            selectOnly(local.id);

            return;
        }

        void fetchFilesByIds([id]).then((rows) => {
            const row = rows[0];

            if (!row) {
                patchLocationQuery({ file: null });

                return;
            }

            setDetailFile(row);
            selectOnly(row.id);
        });
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- boot once from the URL; later selection/files identity changes are ignored on purpose
    }, []);

    return { detailFile, setDetailFile, openFileDetails, closeFileDetails };
}
