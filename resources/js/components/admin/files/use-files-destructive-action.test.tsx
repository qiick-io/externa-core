import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AdminFileRow } from '@/types/files';
import { useFilesDestructiveAction } from './use-files-destructive-action';

const mocks = vi.hoisted(() => ({
    bulkFileAction: vi.fn(),
    deleteFile: vi.fn(),
    fetchFileWhereUsed: vi.fn(),
    forceDeleteFile: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/files-api', () => ({
    bulkFileAction: mocks.bulkFileAction,
    deleteFile: mocks.deleteFile,
    fetchFileWhereUsed: mocks.fetchFileWhereUsed,
    forceDeleteFile: mocks.forceDeleteFile,
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: mocks.toastError },
}));

function row(id: number, type: 'file' | 'folder' = 'file'): AdminFileRow {
    return { id, name: `row-${id}`, type } as AdminFileRow;
}

describe('useFilesDestructiveAction', () => {
    beforeEach(() => {
        for (const mock of Object.values(mocks)) {
            mock.mockReset();
        }
    });

    it('counts references of plain files only', async () => {
        mocks.fetchFileWhereUsed.mockImplementation((fileId: number) =>
            fileId === 1
                ? Promise.resolve({ count: 2 })
                : Promise.reject(new Error('gone')),
        );
        const { result } = renderHook(() => useFilesDestructiveAction(vi.fn()));

        act(() => {
            result.current.requestDestructive('delete', [
                row(1),
                row(2),
                row(3, 'folder'),
            ]);
        });

        expect(result.current.pendingDestructive?.targets).toHaveLength(3);
        expect(result.current.isDestructiveRefLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isDestructiveRefLoading).toBe(false);
        });
        expect(mocks.fetchFileWhereUsed).toHaveBeenCalledTimes(2);
        expect(result.current.destructiveRefCount).toBe(2);
    });

    it('skips the reference lookup for more than ten files', () => {
        const { result } = renderHook(() => useFilesDestructiveAction(vi.fn()));

        act(() => {
            result.current.requestDestructive(
                'delete',
                Array.from({ length: 11 }, (_, index) => row(index + 1)),
            );
        });

        expect(mocks.fetchFileWhereUsed).not.toHaveBeenCalled();
        expect(result.current.isDestructiveRefLoading).toBe(false);
    });

    it('deletes a single file and closes the confirmation', async () => {
        mocks.deleteFile.mockResolvedValue(undefined);
        const onDeleted = vi.fn();
        const { result } = renderHook(() =>
            useFilesDestructiveAction(onDeleted),
        );

        act(() => {
            result.current.requestDestructive('delete', [row(1, 'folder')]);
        });

        await act(async () => {
            await result.current.executePendingDestructive();
        });

        expect(mocks.deleteFile).toHaveBeenCalledWith(1);
        expect(onDeleted).toHaveBeenCalledTimes(1);
        expect(result.current.pendingDestructive).toBeNull();
        expect(result.current.isConfirmingDestructive).toBe(false);
    });

    it('force-deletes several files through the bulk endpoint', async () => {
        mocks.bulkFileAction.mockResolvedValue(undefined);
        const { result } = renderHook(() => useFilesDestructiveAction(vi.fn()));

        act(() => {
            result.current.requestDestructive('force_delete', [
                row(1, 'folder'),
                row(2, 'folder'),
            ]);
        });

        await act(async () => {
            await result.current.executePendingDestructive();
        });

        expect(mocks.bulkFileAction).toHaveBeenCalledWith(
            'force_delete',
            [1, 2],
        );
    });

    it('keeps the confirmation open when the delete fails', async () => {
        mocks.deleteFile.mockRejectedValue(new Error('Locked'));
        const onDeleted = vi.fn();
        const { result } = renderHook(() =>
            useFilesDestructiveAction(onDeleted),
        );

        act(() => {
            result.current.requestDestructive('delete', [row(1, 'folder')]);
        });

        await act(async () => {
            await result.current.executePendingDestructive();
        });

        expect(mocks.toastError).toHaveBeenCalledWith('Locked');
        expect(onDeleted).not.toHaveBeenCalled();
        expect(result.current.pendingDestructive).not.toBeNull();
    });
});
