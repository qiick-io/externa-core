import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { AutocompleteInput } from '@/components/collections/autocomplete-input';

describe('AutocompleteInput', () => {
    // Radix popper and cmdk measure and scroll; jsdom has neither API.
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        },
    );

    if (!('scrollIntoView' in Element.prototype)) {
        Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    }

    afterEach(cleanup);

    it('points aria-controls at the open suggestions popup (#671)', () => {
        render(
            <AutocompleteInput
                aria-label="City"
                suggestions={[
                    { value: 'rome', label: 'Rome' },
                    { value: 'milan', label: 'Milan' },
                ]}
                onSelectSuggestion={vi.fn()}
            />,
        );

        const combobox = screen.getByRole('combobox', { name: 'City' });
        fireEvent.click(combobox);

        const popupId = combobox.getAttribute('aria-controls');

        expect(combobox).toHaveAttribute('aria-expanded', 'true');
        expect(popupId).toBeTruthy();
        expect(
            document
                .getElementById(popupId ?? '')
                ?.querySelector('[role="listbox"]'),
        ).not.toBeNull();
    });
});
