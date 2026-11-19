import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { FileUrlImportDialog } from '@/components/admin/file-url-import-dialog';
import { importFileFromUrl, isImageFile } from '@/lib/files-api';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/lib/files-api', () => ({
    importFileFromUrl: vi.fn(),
    isImageFile: vi.fn(() => false),
}));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('FileUrlImportDialog', () => {
    it('does not submit on Enter while IME composition is open', async () => {
        vi.mocked(importFileFromUrl).mockResolvedValue({
            id: 1,
            name: 'file.png',
        } as never);

        render(
            <FileUrlImportDialog
                open
                onOpenChange={vi.fn()}
                acceptImagesOnly={false}
                onImported={vi.fn()}
            />,
        );

        const input = screen.getByRole('textbox', {
            name: 'collections.fileField.importFromUrl',
        });
        fireEvent.change(input, {
            target: { value: 'https://example.com/file.png' },
        });
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        await Promise.resolve();
        expect(importFileFromUrl).not.toHaveBeenCalled();
    });

    it('submits on Enter when IME composition is not open', async () => {
        const imported = { id: 1, name: 'file.png' } as never;
        const onImported = vi.fn();
        vi.mocked(importFileFromUrl).mockResolvedValue(imported);
        vi.mocked(isImageFile).mockReturnValue(false);

        render(
            <FileUrlImportDialog
                open
                onOpenChange={vi.fn()}
                acceptImagesOnly={false}
                onImported={onImported}
            />,
        );

        const input = screen.getByRole('textbox', {
            name: 'collections.fileField.importFromUrl',
        });
        fireEvent.change(input, {
            target: { value: 'https://example.com/file.png' },
        });
        fireEvent.keyDown(input, { key: 'Enter' });

        await Promise.resolve();
        await Promise.resolve();
        expect(importFileFromUrl).toHaveBeenCalledWith(
            'https://example.com/file.png',
            null,
        );
        expect(onImported).toHaveBeenCalledWith(imported);
    });
});
