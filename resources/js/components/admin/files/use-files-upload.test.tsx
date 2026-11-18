import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { dismissAllFileUploads, getFileUploads } from '@/lib/file-upload-store';
import { useFilesUpload } from './use-files-upload';

const mocks = vi.hoisted(() => ({
    uploadFileDirect: vi.fn(),
    uploadFileChunked: vi.fn(),
    createFolder: vi.fn(),
    listFilesPage: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({
        props: { projectSettings: { filesMaxUploadBytes: 1_000 } },
    }),
}));

vi.mock('@/lib/files-api', () => ({
    CHUNK_SIZE_BYTES: 100,
    uploadFileDirect: mocks.uploadFileDirect,
    uploadFileChunked: mocks.uploadFileChunked,
    createFolder: mocks.createFolder,
    listFilesPage: mocks.listFilesPage,
}));

function renderUpload(uploadsEnabled: boolean, refreshPage = vi.fn()) {
    return renderHook(() =>
        useFilesUpload({ parentId: 4, uploadsEnabled, refreshPage }),
    );
}

describe('useFilesUpload', () => {
    beforeEach(() => {
        mocks.uploadFileDirect.mockReset();
        mocks.uploadFileChunked.mockReset();
        dismissAllFileUploads();
    });

    it('uploads a small file directly into the current folder', async () => {
        mocks.uploadFileDirect.mockResolvedValue(undefined);
        const refreshPage = vi.fn();
        const { result } = renderUpload(true, refreshPage);
        const file = new File(['hello'], 'hello.txt');

        act(() => {
            result.current.handleFilesSelected([file]);
        });

        await waitFor(() => {
            expect(refreshPage).toHaveBeenCalledTimes(1);
        });
        expect(mocks.uploadFileDirect).toHaveBeenCalledWith(file, 4, 1_000);
        expect(mocks.uploadFileChunked).not.toHaveBeenCalled();
        expect(getFileUploads()).toEqual([
            expect.objectContaining({
                fileName: 'hello.txt',
                kind: 'file',
                status: 'complete',
            }),
        ]);
    });

    it('uploads files larger than one chunk through the chunked endpoint', async () => {
        mocks.uploadFileChunked.mockResolvedValue(undefined);
        const refreshPage = vi.fn();
        const { result } = renderUpload(true, refreshPage);
        const file = new File(['x'.repeat(250)], 'large.bin');

        act(() => {
            result.current.handleFilesSelected([file]);
        });

        await waitFor(() => {
            expect(refreshPage).toHaveBeenCalledTimes(1);
        });
        expect(mocks.uploadFileChunked).toHaveBeenCalledWith(
            file,
            4,
            expect.any(Function),
            1_000,
        );
    });

    it('records the error and skips the refresh when the upload fails', async () => {
        mocks.uploadFileDirect.mockRejectedValue(new Error('Too large'));
        const refreshPage = vi.fn();
        const { result } = renderUpload(true, refreshPage);

        act(() => {
            result.current.handleFilesSelected([new File(['a'], 'a.txt')]);
        });

        await waitFor(() => {
            expect(getFileUploads()[0]?.status).toBe('error');
        });
        expect(getFileUploads()[0]?.error).toBe('Too large');
        expect(refreshPage).not.toHaveBeenCalled();
    });

    it('ignores files while uploads are disabled', () => {
        const { result } = renderUpload(false);

        act(() => {
            result.current.handleFilesSelected([new File(['a'], 'a.txt')]);
        });

        expect(mocks.uploadFileDirect).not.toHaveBeenCalled();
        expect(getFileUploads()).toEqual([]);
    });

    it('clears the file input after a selection', () => {
        const { result } = renderUpload(false);
        const target = { files: null, value: 'C:\\fakepath\\a.txt' };

        act(() => {
            result.current.handleUploadInputChange({
                target,
            } as unknown as ChangeEvent<HTMLInputElement>);
        });

        expect(target.value).toBe('');
    });
});
