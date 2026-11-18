import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { AdminFileRow } from '@/types/files';
import { useFileDetailForm } from './use-file-detail-form';

const mocks = vi.hoisted(() => ({
    updateFileMetadata: vi.fn(),
    syncFileTags: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/toast', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('@/lib/files-api', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    updateFileMetadata: mocks.updateFileMetadata,
    syncFileTags: mocks.syncFileTags,
}));

function image(overrides: Partial<AdminFileRow> = {}): AdminFileRow {
    return {
        id: 7,
        type: 'file',
        name: 'photo.jpg',
        mime_type: 'image/jpeg',
        extension: 'jpg',
        title: 'Photo',
        description: null,
        location: null,
        download_name: null,
        access: null,
        focal_point_x: 0.25,
        focal_point_y: 0.75,
        tags: [{ id: 1, name: 'hero' }],
        ...overrides,
    } as AdminFileRow;
}

describe('useFileDetailForm', () => {
    beforeEach(() => {
        mocks.updateFileMetadata.mockReset();
        mocks.syncFileTags.mockReset();
        mocks.toastSuccess.mockReset();
        mocks.toastError.mockReset();
    });

    it('saves trimmed metadata, the focal point and the tags', async () => {
        const saved = image({ title: 'Cover' });
        const tagged = image({ title: 'Cover', tags: [] });
        mocks.updateFileMetadata.mockResolvedValue(saved);
        mocks.syncFileTags.mockResolvedValue(tagged);
        const onUpdated = vi.fn();
        const file = image();
        const { result } = renderHook(() =>
            useFileDetailForm({
                file,
                canUpdateMetadata: true,
                canTag: true,
                onUpdated,
            }),
        );

        expect(result.current.access).toBe('inherit');
        expect(result.current.focalPoint).toEqual({ x: 0.25, y: 0.75 });

        act(() => {
            result.current.setTitle('  Cover  ');
            result.current.setAccess('private');
        });

        await act(async () => {
            await result.current.handleSave();
        });

        expect(mocks.updateFileMetadata).toHaveBeenCalledWith(7, {
            title: 'Cover',
            description: null,
            location: null,
            download_name: null,
            access: 'private',
            focal_point_x: 0.25,
            focal_point_y: 0.75,
        });
        expect(mocks.syncFileTags).toHaveBeenCalledWith(7, ['hero']);
        expect(onUpdated).toHaveBeenCalledWith(tagged);
        expect(mocks.toastSuccess).toHaveBeenCalledWith('files.detail.updated');
        expect(result.current.saving).toBe(false);
    });

    it('skips calls the user may not make and reports failures', async () => {
        mocks.syncFileTags.mockRejectedValue(new Error('Nope'));
        const onUpdated = vi.fn();
        const file = image();
        const { result } = renderHook(() =>
            useFileDetailForm({
                file,
                canUpdateMetadata: false,
                canTag: true,
                onUpdated,
            }),
        );

        await act(async () => {
            await result.current.handleSave();
        });

        expect(mocks.updateFileMetadata).not.toHaveBeenCalled();
        expect(onUpdated).not.toHaveBeenCalled();
        expect(mocks.toastError).toHaveBeenCalledWith('Nope');
    });

    it('reloads the form when another file arrives', () => {
        const { result, rerender } = renderHook(
            ({ file }) =>
                useFileDetailForm({
                    file,
                    canUpdateMetadata: true,
                    canTag: true,
                    onUpdated: vi.fn(),
                }),
            { initialProps: { file: image() } },
        );

        act(() => {
            result.current.setTitle('Draft');
        });

        rerender({
            file: image({ id: 8, title: 'Other', access: 'public' }),
        });

        expect(result.current.title).toBe('Other');
        expect(result.current.access).toBe('public');
    });
});
