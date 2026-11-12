import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useFilesDragMove } from './use-files-drag-move';

const mocks = vi.hoisted(() => ({
    moveFile: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/files-api', () => ({
    moveFile: mocks.moveFile,
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: mocks.toastError },
}));

function renderDragMove(canEdit = true, refreshPage = vi.fn()) {
    return renderHook(() =>
        useFilesDragMove({
            canEdit,
            isTrashed: false,
            parentId: 2,
            refreshPage,
        }),
    );
}

describe('useFilesDragMove', () => {
    beforeEach(() => {
        mocks.moveFile.mockReset();
        mocks.moveFile.mockResolvedValue(undefined);
        mocks.toastError.mockReset();
    });

    it('moves the dragged file into the folder it is dropped on', async () => {
        const refreshPage = vi.fn();
        const { result } = renderDragMove(true, refreshPage);

        act(() => {
            result.current.onDragStart(10);
            result.current.onDragOverFolder(20);
        });

        expect(result.current.dropTargetFolderId).toBe(20);

        act(() => {
            result.current.onDropOnFolder(20);
        });

        expect(mocks.moveFile).toHaveBeenCalledWith(10, 20);
        expect(result.current.dropTargetFolderId).toBeNull();
        await waitFor(() => {
            expect(refreshPage).toHaveBeenCalledTimes(1);
        });
    });

    it('moves the dragged file into the current folder when dropped on the grid', () => {
        const { result } = renderDragMove();

        act(() => {
            result.current.onDragStart(10);
        });
        act(() => {
            result.current.onDropOnGrid();
        });

        expect(mocks.moveFile).toHaveBeenCalledWith(10, 2);
    });

    it('never moves a folder into itself', () => {
        const { result } = renderDragMove();

        act(() => {
            result.current.onDragStart(20);
        });
        act(() => {
            result.current.onDropOnFolder(20);
        });

        expect(mocks.moveFile).not.toHaveBeenCalled();
    });

    it('does not move without the edit permission', () => {
        const { result } = renderDragMove(false);

        act(() => {
            result.current.onDragStart(10);
        });
        act(() => {
            result.current.onDropOnFolder(20);
        });

        expect(mocks.moveFile).not.toHaveBeenCalled();
    });

    it('only clears the highlight when leaving the highlighted folder', () => {
        const { result } = renderDragMove();

        act(() => {
            result.current.onDragOverFolder(20);
        });
        act(() => {
            result.current.onDragLeaveFolder(30);
        });

        expect(result.current.dropTargetFolderId).toBe(20);

        act(() => {
            result.current.onDragLeaveFolder(20);
        });

        expect(result.current.dropTargetFolderId).toBeNull();
    });

    it('shows the error when the move fails', async () => {
        mocks.moveFile.mockRejectedValue(new Error('Not allowed'));
        const { result } = renderDragMove();

        act(() => {
            result.current.onDragStart(10);
        });
        act(() => {
            result.current.onDropOnGrid();
        });

        await waitFor(() => {
            expect(mocks.toastError).toHaveBeenCalledWith('Not allowed');
        });
    });
});
