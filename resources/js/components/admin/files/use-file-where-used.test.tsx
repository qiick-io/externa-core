import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AdminFileRow } from '@/types/files';
import { useFileWhereUsed } from './use-file-where-used';

const mocks = vi.hoisted(() => ({
    fetchFileWhereUsed: vi.fn(),
}));

const translate = (key: string) => key;

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: translate }),
}));

vi.mock('@/lib/files-api', () => ({
    fetchFileWhereUsed: mocks.fetchFileWhereUsed,
}));

function row(id: number, type: AdminFileRow['type'] = 'file'): AdminFileRow {
    return { id, type, name: `row-${id}` } as AdminFileRow;
}

const reference = {
    collection_id: 1,
    collection_name: 'Posts',
    item_id: 3,
    field: 'cover',
};

describe('useFileWhereUsed', () => {
    beforeEach(() => {
        mocks.fetchFileWhereUsed.mockReset();
    });

    it('loads the references of a file', async () => {
        mocks.fetchFileWhereUsed.mockResolvedValue({ references: [reference] });
        const file = row(5);
        const { result } = renderHook(() => useFileWhereUsed(file));

        expect(result.current.whereUsedLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.whereUsedLoading).toBe(false);
        });

        expect(mocks.fetchFileWhereUsed).toHaveBeenCalledWith(5);
        expect(result.current.whereUsedRefs).toEqual([reference]);
        expect(result.current.whereUsedError).toBeNull();
    });

    it('reports a failed scan with an empty list', async () => {
        mocks.fetchFileWhereUsed.mockRejectedValue(new Error('Scan failed'));
        const file = row(5);
        const { result } = renderHook(() => useFileWhereUsed(file));

        await waitFor(() => {
            expect(result.current.whereUsedLoading).toBe(false);
        });

        expect(result.current.whereUsedError).toBe('Scan failed');
        expect(result.current.whereUsedRefs).toEqual([]);
    });

    it('never scans folders', () => {
        const folder = row(9, 'folder');
        const { result } = renderHook(() => useFileWhereUsed(folder));

        expect(result.current.whereUsedLoading).toBe(false);
        expect(mocks.fetchFileWhereUsed).not.toHaveBeenCalled();
    });

    it('rescans when another file arrives', async () => {
        mocks.fetchFileWhereUsed.mockResolvedValue({ references: [reference] });
        const { result, rerender } = renderHook(
            ({ file }) => useFileWhereUsed(file),
            { initialProps: { file: row(5) } },
        );

        await waitFor(() => {
            expect(result.current.whereUsedLoading).toBe(false);
        });

        mocks.fetchFileWhereUsed.mockResolvedValue({ references: [] });
        rerender({ file: row(6) });

        expect(result.current.whereUsedLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.whereUsedRefs).toEqual([]);
        });

        expect(mocks.fetchFileWhereUsed).toHaveBeenLastCalledWith(6);
    });
});
