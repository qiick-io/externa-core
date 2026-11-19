import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { FileNameDialog } from '@/components/admin/file-name-dialog';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

afterEach(() => {
    cleanup();
});

describe('FileNameDialog', () => {
    it('does not submit on Enter while IME composition is open', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(
            <FileNameDialog
                open
                onOpenChange={vi.fn()}
                title="Rename"
                initialName="photo.jpg"
                onConfirm={onConfirm}
            />,
        );

        const input = screen.getByLabelText('files.nameDialog.name');
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        // allow any async submit path to flush if it incorrectly ran
        await Promise.resolve();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('submits on Enter when IME composition is not open', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(
            <FileNameDialog
                open
                onOpenChange={vi.fn()}
                title="Rename"
                initialName="photo.jpg"
                onConfirm={onConfirm}
            />,
        );

        const input = screen.getByLabelText('files.nameDialog.name');
        fireEvent.keyDown(input, { key: 'Enter' });

        await Promise.resolve();
        await Promise.resolve();
        expect(onConfirm).toHaveBeenCalledWith('photo.jpg');
    });
});
