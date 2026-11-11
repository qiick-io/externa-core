import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { FilePreview } from '@/components/admin/files/file-preview';
import type { AdminFileRow } from '@/types/files';

const imageFile = {
    id: 25,
    type: 'file',
    name: 'tiny.png',
    title: null,
    extension: 'png',
    mime_type: 'image/png',
    storage_path: '2026/10/tiny.png',
    thumbnail_url: 'https://cdn.test/tiny.png',
} as AdminFileRow;

afterEach(() => cleanup());

describe('FilePreview', () => {
    it.each(['icon', 'cover'] as const)(
        'falls back to the type icon when the %s thumbnail fails to load',
        (variant) => {
            render(<FilePreview file={imageFile} variant={variant} />);

            fireEvent.error(screen.getByRole('img', { name: 'tiny.png' }));

            expect(screen.queryByRole('img', { name: 'tiny.png' })).toBeNull();
            expect(screen.getByTestId('file-preview-icon')).toBeTruthy();
        },
    );
});
