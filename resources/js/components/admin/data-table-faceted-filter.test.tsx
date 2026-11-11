import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { DataTableFacetedFilter } from './data-table-faceted-filter';

// cmdk measures and scrolls its list; jsdom has neither API.
globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
};

if (!('scrollIntoView' in Element.prototype)) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

const options = [
    { value: 'auth', label: 'Authentication' },
    { value: 'ai', label: 'AI' },
];

afterEach(() => {
    cleanup();
});

describe('DataTableFacetedFilter', () => {
    it('keeps one value in single mode and clears it on a second pick', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        const { rerender } = render(
            <DataTableFacetedFilter
                title="Log name"
                ariaLabel="Filter by log name"
                options={options}
                selectedValues={['ai']}
                onSelectedValuesChange={onChange}
                isMultiple={false}
            />,
        );

        await user.click(screen.getByLabelText('Filter by log name'));
        await user.click(
            await screen.findByRole('option', { name: 'Authentication' }),
        );
        expect(onChange).toHaveBeenLastCalledWith(['auth']);

        rerender(
            <DataTableFacetedFilter
                title="Log name"
                ariaLabel="Filter by log name"
                options={options}
                selectedValues={['auth']}
                onSelectedValuesChange={onChange}
                isMultiple={false}
            />,
        );
        await user.click(
            screen.getByRole('option', { name: 'Authentication' }),
        );
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it('adds values in multiple mode', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <DataTableFacetedFilter
                title="Log name"
                options={options}
                selectedValues={['ai']}
                onSelectedValuesChange={onChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: /Log name/ }));
        await user.click(
            await screen.findByRole('option', { name: 'Authentication' }),
        );
        expect(onChange).toHaveBeenLastCalledWith(['ai', 'auth']);
    });
});
