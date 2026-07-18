import { useCallback, useEffect, useState } from 'react';
import type { AdminFileRow } from '@/types/files';

export function useFilesSelection(
    files: AdminFileRow[],
    resetKey: string | number | null,
) {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [anchorId, setAnchorId] = useState<number | null>(null);

    useEffect(() => {
        setSelectedIds([]);
        setAnchorId(null);
    }, [resetKey]);

    const selectedFiles = files.filter((file) => selectedIds.includes(file.id));

    const clearSelection = useCallback((): void => {
        setSelectedIds([]);
        setAnchorId(null);
    }, []);

    const selectOnly = useCallback((fileId: number): void => {
        setSelectedIds([fileId]);
        setAnchorId(fileId);
    }, []);

    const toggle = useCallback((fileId: number): void => {
        setSelectedIds((current) =>
            current.includes(fileId)
                ? current.filter((id) => id !== fileId)
                : [...current, fileId],
        );
        setAnchorId(fileId);
    }, []);

    const selectRange = useCallback(
        (fileId: number): void => {
            if (anchorId === null) {
                selectOnly(fileId);
                return;
            }

            const ids = files.map((file) => file.id);
            const start = ids.indexOf(anchorId);
            const end = ids.indexOf(fileId);

            if (start === -1 || end === -1) {
                selectOnly(fileId);
                return;
            }

            const [from, to] = start < end ? [start, end] : [end, start];
            setSelectedIds(ids.slice(from, to + 1));
        },
        [anchorId, files, selectOnly],
    );

    const handleSelectClick = useCallback(
        (
            fileId: number,
            event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
        ): void => {
            if (event.shiftKey) {
                selectRange(fileId);
                return;
            }

            if (event.metaKey || event.ctrlKey) {
                toggle(fileId);
                return;
            }

            selectOnly(fileId);
        },
        [selectOnly, selectRange, toggle],
    );

    return {
        selectedIds,
        selectedFiles,
        clearSelection,
        selectOnly,
        toggle,
        handleSelectClick,
        isSelected: (fileId: number) => selectedIds.includes(fileId),
        multiSelectMode: selectedIds.length > 1,
    };
}
