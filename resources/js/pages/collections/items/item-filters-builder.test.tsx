import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { CollectionFieldRow } from '@/types';
import { ItemFiltersBuilder } from './item-filters-builder';

afterEach(() => {
    cleanup();
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

describe('ItemFiltersBuilder', () => {
    it('labels every operator through translations', () => {
        render(
            <ItemFiltersBuilder
                fields={
                    [
                        { name: 'title', label: 'Title', type: 'string' },
                    ] as unknown as CollectionFieldRow[]
                }
                rules={[
                    { id: 'r1', field: 'title', operator: '_eq', value: '' },
                ]}
                onChange={vi.fn()}
                onApply={vi.fn()}
                onClear={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'a11y.filters' }));

        const operator = screen.getByRole('combobox', {
            name: 'a11y.filterOperator',
        });
        const labels = within(operator)
            .getAllByRole('option')
            .map((option) => option.textContent);

        expect(labels).toContain('collections.itemsList.operators.eq');
        expect(labels).toContain('collections.itemsList.operators.nnull');
        expect(labels.every((label) => label?.startsWith('collections.'))).toBe(
            true,
        );
    });

    it('does not apply filters on Enter while IME composition is open', () => {
        const onApply = vi.fn();

        render(
            <ItemFiltersBuilder
                fields={
                    [
                        { name: 'title', label: 'Title', type: 'string' },
                    ] as unknown as CollectionFieldRow[]
                }
                rules={[
                    { id: 'r1', field: 'title', operator: '_eq', value: '' },
                ]}
                onChange={vi.fn()}
                onApply={onApply}
                onClear={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'a11y.filters' }));
        const input = screen.getByRole('textbox', { name: 'a11y.filterValue' });

        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        expect(onApply).not.toHaveBeenCalled();
    });

    it('applies filters on Enter when IME composition is not open', () => {
        const onApply = vi.fn();

        render(
            <ItemFiltersBuilder
                fields={
                    [
                        { name: 'title', label: 'Title', type: 'string' },
                    ] as unknown as CollectionFieldRow[]
                }
                rules={[
                    { id: 'r1', field: 'title', operator: '_eq', value: '' },
                ]}
                onChange={vi.fn()}
                onApply={onApply}
                onClear={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'a11y.filters' }));
        const input = screen.getByRole('textbox', { name: 'a11y.filterValue' });

        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onApply).toHaveBeenCalledTimes(1);
    });
});
