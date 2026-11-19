import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { TagPicker } from './tag-picker';

// cmdk measures and scrolls its list; jsdom has neither API.
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

if (!('scrollIntoView' in Element.prototype)) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

const catalog = [
    { id: 1, name: 'invoice' },
    { id: 2, name: 'draft' },
];

afterEach(() => {
    cleanup();
});

describe('TagPicker', () => {
    it('creates a new tag from the typed name', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <TagPicker
                id="file-tags"
                value={['draft']}
                onChange={onChange}
                catalog={catalog}
            />,
        );

        await user.click(screen.getByRole('combobox'));
        await user.type(
            await screen.findByPlaceholderText('files.tags.placeholder'),
            'contract{Enter}',
        );

        expect(onChange).toHaveBeenLastCalledWith(['draft', 'contract']);
    });

    it('reuses an existing tag and removes a chip', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <TagPicker
                value={['draft']}
                onChange={onChange}
                catalog={catalog}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'files.tags.remove' }),
        );
        expect(onChange).toHaveBeenLastCalledWith([]);

        await user.click(screen.getByRole('combobox'));
        await user.click(
            await screen.findByRole('option', { name: 'invoice' }),
        );
        expect(onChange).toHaveBeenLastCalledWith(['draft', 'invoice']);
    });

    it('does not create a tag on Enter while IME composition is open', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <TagPicker
                value={['draft']}
                onChange={onChange}
                catalog={catalog}
            />,
        );

        await user.click(screen.getByRole('combobox'));
        const input = await screen.findByPlaceholderText(
            'files.tags.placeholder',
        );

        await user.type(input, 'contract');
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        expect(onChange).not.toHaveBeenCalled();
    });

    it('creates a tag on Enter when IME composition is not open', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <TagPicker
                value={['draft']}
                onChange={onChange}
                catalog={catalog}
            />,
        );

        await user.click(screen.getByRole('combobox'));
        const input = await screen.findByPlaceholderText(
            'files.tags.placeholder',
        );

        await user.type(input, 'contract');
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onChange).toHaveBeenLastCalledWith(['draft', 'contract']);
    });
});
