import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { ThemePresetField } from '@/components/settings/theme-preset-field';
import type { ThemePresetCatalogItem, ThemePresetSlug } from '@/types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'settings.appearance.themePresetTitle': 'Theme preset',
                'settings.appearance.themePresetTeal': 'qiick Teal (default)',
                'settings.appearance.themePresetRose': 'Rose',
            };

            return translations[key] ?? key;
        },
    }),
}));

const catalog: ThemePresetCatalogItem[] = [
    {
        slug: 'teal',
        name: 'qiick Teal (default)',
        aiOverride: false,
        swatchLight: '#0E7C86',
        swatchDark: '#2CB1BC',
    },
    {
        slug: 'rose',
        name: 'Rose',
        aiOverride: false,
        swatchLight: '#AF3774',
        swatchDark: '#F07AAE',
    },
];

/**
 * Controlled harness so the test exercises the picker the way the page does.
 */
function ThemePresetFieldHarness({
    initialValue,
    onChange,
}: {
    initialValue: ThemePresetSlug;
    onChange: (value: ThemePresetSlug) => void;
}) {
    const [value, setValue] = useState(initialValue);

    return (
        <form data-testid="appearance-form">
            <ThemePresetField
                catalog={catalog}
                value={value}
                onChange={(nextValue) => {
                    setValue(nextValue);
                    onChange(nextValue);
                }}
            />
        </form>
    );
}

beforeAll(() => {
    // jsdom has no ResizeObserver; Radix RadioGroup measures items with it.
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        },
    );
});

afterEach(() => {
    cleanup();
});

afterAll(() => {
    vi.unstubAllGlobals();
});

describe('ThemePresetField', () => {
    it('shows the saved preset as checked and submits it as theme_preset', () => {
        render(
            <ThemePresetFieldHarness initialValue="rose" onChange={vi.fn()} />,
        );

        expect(
            screen.getByRole('radiogroup', { name: 'Theme preset' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Rose' })).toBeChecked();
        expect(
            new FormData(screen.getByTestId('appearance-form')).get(
                'theme_preset',
            ),
        ).toBe('rose');
    });

    it('selects another preset when its card is chosen', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        render(
            <ThemePresetFieldHarness initialValue="teal" onChange={onChange} />,
        );

        await user.click(screen.getByText('Rose'));

        expect(onChange).toHaveBeenLastCalledWith('rose');
        expect(screen.getByRole('radio', { name: 'Rose' })).toBeChecked();
        expect(
            new FormData(screen.getByTestId('appearance-form')).get(
                'theme_preset',
            ),
        ).toBe('rose');
    });

    it('links the validation error to the radio group', () => {
        render(
            <form>
                <ThemePresetField
                    catalog={catalog}
                    value="teal"
                    onChange={vi.fn()}
                    error="The selected theme preset is invalid."
                />
            </form>,
        );

        const radioGroup = screen.getByRole('radiogroup');

        expect(radioGroup).toHaveAttribute('aria-invalid', 'true');
        expect(radioGroup).toHaveAccessibleDescription(
            'The selected theme preset is invalid.',
        );
    });
});
