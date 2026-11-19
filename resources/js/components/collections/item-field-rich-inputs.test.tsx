import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@/components/collections/rich-inputs/markdown-field-input', () => ({
    MarkdownFieldInput: () => null,
}));

vi.mock('@/components/collections/rich-inputs/wysiwyg-field-input', () => ({
    WysiwygFieldInput: () => null,
    WysiwygLinkPopover: () => null,
}));

vi.mock('@/components/collections/rich-inputs/markdown-toolbar', () => ({
    MarkdownModeToggle: () => null,
}));

import { TagChipInput } from '@/components/collections/item-field-rich-inputs';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) =>
            options?.name ? `${key}:${options.name}` : key,
    }),
}));

afterEach(() => {
    cleanup();
});

describe('TagChipInput', () => {
    it('does not add a tag on Enter while IME composition is open', async () => {
        render(
            <TagChipInput
                nameBase="tags"
                defaultParts={[]}
                readonly={false}
                settings={{ allow_other: true, presets: [] }}
            />,
        );

        const input = screen.getByPlaceholderText('richText.addTag');
        fireEvent.change(input, { target: { value: 'japanese' } });
        await screen.findByDisplayValue('japanese');
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        expect(screen.queryByText('japanese')).toBeNull();
    });

    it('adds a tag on Enter when IME composition is not open', async () => {
        render(
            <TagChipInput
                nameBase="tags"
                defaultParts={[]}
                readonly={false}
                settings={{ allow_other: true, presets: [] }}
            />,
        );

        const input = screen.getByPlaceholderText('richText.addTag');
        fireEvent.change(input, { target: { value: 'japanese' } });
        await screen.findByDisplayValue('japanese');
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByText('japanese')).toBeInTheDocument();
    });
});
