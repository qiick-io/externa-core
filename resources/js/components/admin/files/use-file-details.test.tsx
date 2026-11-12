import { act, renderHook, waitFor } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import type { AdminFileRow } from '@/types/files';
import { useFileDetails } from './use-file-details';

const mocks = vi.hoisted(() => ({
    fetchFilesByIds: vi.fn(),
    patchLocationQuery: vi.fn(),
}));

vi.mock('@/lib/admin-query-params', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    patchLocationQuery: mocks.patchLocationQuery,
}));

vi.mock('@/lib/files-api', () => ({
    fetchFilesByIds: mocks.fetchFilesByIds,
}));

function row(id: number): AdminFileRow {
    return { id, name: `row-${id}`, type: 'file' } as AdminFileRow;
}

describe('useFileDetails', () => {
    beforeEach(() => {
        mocks.fetchFilesByIds.mockReset();
        mocks.patchLocationQuery.mockReset();
    });

    afterEach(() => {
        window.history.replaceState(null, '', '/');
    });

    it('opens and closes the details and keeps them in the URL', () => {
        const selectOnly = vi.fn();
        const { result } = renderHook(() =>
            useFileDetails([row(1)], false, selectOnly),
        );

        act(() => {
            result.current.openFileDetails(row(1));
        });

        expect(result.current.detailFile?.id).toBe(1);
        expect(selectOnly).toHaveBeenCalledWith(1);
        expect(mocks.patchLocationQuery).toHaveBeenCalledWith({ file: '1' });

        act(() => {
            result.current.closeFileDetails();
        });

        expect(result.current.detailFile).toBeNull();
        expect(mocks.patchLocationQuery).toHaveBeenLastCalledWith({
            file: null,
        });
    });

    it('opens the linked file from the rows on screen', () => {
        window.history.replaceState(null, '', '/files?file=2');
        const selectOnly = vi.fn();
        const { result } = renderHook(() =>
            useFileDetails([row(1), row(2)], false, selectOnly),
        );

        expect(result.current.detailFile?.id).toBe(2);
        expect(selectOnly).toHaveBeenCalledWith(2);
        expect(mocks.fetchFilesByIds).not.toHaveBeenCalled();
    });

    it('fetches a linked file that is not on screen', async () => {
        window.history.replaceState(null, '', '/files?file=9');
        mocks.fetchFilesByIds.mockResolvedValue([row(9)]);
        const { result } = renderHook(() =>
            useFileDetails([row(1)], false, vi.fn()),
        );

        await waitFor(() => {
            expect(result.current.detailFile?.id).toBe(9);
        });
        expect(mocks.fetchFilesByIds).toHaveBeenCalledWith([9]);
    });

    it('removes an unknown linked file from the URL', async () => {
        window.history.replaceState(null, '', '/files?file=9');
        mocks.fetchFilesByIds.mockResolvedValue([]);
        renderHook(() => useFileDetails([], false, vi.fn()));

        await waitFor(() => {
            expect(mocks.patchLocationQuery).toHaveBeenCalledWith({
                file: null,
            });
        });
    });

    it('ignores the link in the trash', () => {
        window.history.replaceState(null, '', '/files?file=1');
        const { result } = renderHook(() =>
            useFileDetails([row(1)], true, vi.fn()),
        );

        expect(result.current.detailFile).toBeNull();
    });
});
