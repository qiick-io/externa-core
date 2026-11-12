import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AdminFileRow } from '@/types/files';
import { useFilesActionRunner } from './use-files-action-runner';

const mocks = vi.hoisted(() => ({
    bulkFileAction: vi.fn(),
    copyFile: vi.fn(),
    favoriteFile: vi.fn(),
    queueFilesZipDownload: vi.fn(),
    restoreFile: vi.fn(),
    unfavoriteFile: vi.fn(),
    openAiWithPrompt: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/ai-open', () => ({
    openAiWithPrompt: mocks.openAiWithPrompt,
    seedFilesBulkPrompt: (files: { id: number }[]) =>
        `prompt:${files.map((file) => file.id).join(',')}`,
}));

vi.mock('@/lib/files-api', () => ({
    bulkFileAction: mocks.bulkFileAction,
    copyFile: mocks.copyFile,
    downloadFileUrl: (fileId: number) => `/download/${fileId}`,
    favoriteFile: mocks.favoriteFile,
    queueFilesZipDownload: mocks.queueFilesZipDownload,
    restoreFile: mocks.restoreFile,
    unfavoriteFile: mocks.unfavoriteFile,
}));

vi.mock('@/lib/toast', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function row(id: number, type: 'file' | 'folder' = 'file'): AdminFileRow {
    return { id, name: `row-${id}`, type } as AdminFileRow;
}

function renderRunner(selectedFiles: AdminFileRow[] = []) {
    const options = {
        selectedFiles,
        clearSelection: vi.fn(),
        parentId: 5,
        isAiAvailable: true,
        refreshPage: vi.fn(),
        trackPendingDuplication: vi.fn(),
        trackPendingZip: vi.fn(),
        openFileDetails: vi.fn(),
        requestDestructive: vi.fn(),
        openMoveDialog: vi.fn(),
        openRenameDialog: vi.fn(),
        openTagDialog: vi.fn(),
    };
    const { result } = renderHook(() => useFilesActionRunner(options));

    return { runAction: result.current, options };
}

describe('useFilesActionRunner', () => {
    beforeEach(() => {
        for (const mock of Object.values(mocks)) {
            mock.mockReset();
        }
    });

    it('runs on the current selection when no targets are given', async () => {
        const selected = [row(1), row(2)];
        const { runAction, options } = renderRunner(selected);

        await act(async () => {
            await runAction('move');
        });

        expect(options.openMoveDialog).toHaveBeenCalledWith(selected);
    });

    it('does nothing without targets', async () => {
        const { runAction, options } = renderRunner([]);

        await act(async () => {
            await runAction('tag');
        });

        expect(options.openTagDialog).not.toHaveBeenCalled();
    });

    it('asks for confirmation before deleting', async () => {
        const targets = [row(1)];
        const { runAction, options } = renderRunner();

        await act(async () => {
            await runAction('force_delete', targets);
        });

        expect(options.requestDestructive).toHaveBeenCalledWith(
            'force_delete',
            targets,
        );
    });

    it('queues a ZIP download for several files', async () => {
        mocks.queueFilesZipDownload.mockResolvedValue({ job_id: 'zip-1' });
        const { runAction, options } = renderRunner();

        await act(async () => {
            await runAction('download', [row(1), row(2)]);
        });

        expect(mocks.queueFilesZipDownload).toHaveBeenCalledWith([1, 2]);
        expect(options.trackPendingZip).toHaveBeenCalledWith('zip-1');
        expect(options.clearSelection).toHaveBeenCalledTimes(1);
    });

    it('tracks a queued single duplication and refreshes an immediate one', async () => {
        mocks.copyFile.mockResolvedValueOnce({ queued: true, job_id: 'dup' });
        const queued = renderRunner();

        await act(async () => {
            await queued.runAction('duplicate', [row(1)]);
        });

        expect(mocks.copyFile).toHaveBeenCalledWith(1, 5);
        expect(queued.options.trackPendingDuplication).toHaveBeenCalledWith(
            'dup',
        );
        expect(queued.options.refreshPage).not.toHaveBeenCalled();

        mocks.copyFile.mockResolvedValueOnce({ queued: false });
        const immediate = renderRunner();

        await act(async () => {
            await immediate.runAction('duplicate', [row(1)]);
        });

        expect(mocks.toastSuccess).toHaveBeenCalledWith(
            'files.toasts.duplicated',
        );
        expect(immediate.options.refreshPage).toHaveBeenCalledTimes(1);
    });

    it('uses the bulk endpoint for several favorites', async () => {
        mocks.bulkFileAction.mockResolvedValue(undefined);
        const { runAction, options } = renderRunner();

        await act(async () => {
            await runAction('favorite', [row(1), row(2)]);
        });

        expect(mocks.bulkFileAction).toHaveBeenCalledWith('favorite', [1, 2]);
        expect(mocks.favoriteFile).not.toHaveBeenCalled();
        expect(options.refreshPage).toHaveBeenCalledTimes(1);
    });

    it('opens the assistant with the selected files', async () => {
        const { runAction } = renderRunner();

        await act(async () => {
            await runAction('ask_ai', [row(1), row(3)]);
        });

        expect(mocks.openAiWithPrompt).toHaveBeenCalledWith('prompt:1,3');
    });

    it('shows the error when an action fails', async () => {
        mocks.restoreFile.mockRejectedValue(new Error('Gone'));
        const { runAction, options } = renderRunner();

        await act(async () => {
            await runAction('restore', [row(1)]);
        });

        expect(mocks.toastError).toHaveBeenCalledWith('Gone');
        expect(options.refreshPage).not.toHaveBeenCalled();
    });
});
