import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
    DEFAULT_COLLECTION_ICON,
    LucideIconPicker,
    resolveCollectionIconName,
    toLucideIconKebabName,
    toLucideIconName,
} from './lucide-icon-picker';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

/**
 * The real catalog has about 1,700 icons; rendering them all made the picker test take
 * up to 26 s under a parallel run (#734). The picker tests use a small catalog with
 * real Lucide names, and the catalog itself is checked without rendering below.
 */
vi.mock('./lucide-icon-categories.json', () => ({
    default: {
        categories: [
            {
                id: 'accessibility',
                label: 'Accessibility',
                icons: ['Accessibility', 'Baby', 'Eye'],
            },
            {
                id: 'development',
                label: 'Development',
                icons: ['Database', 'NotARealIcon'],
            },
        ],
    },
}));

describe('toLucideIconKebabName', () => {
    it('converts PascalCase to lucide-react DynamicIcon keys', () => {
        expect(toLucideIconKebabName('Database')).toBe('database');
        expect(toLucideIconKebabName('ChevronsUpDown')).toBe(
            'chevrons-up-down',
        );
        expect(toLucideIconKebabName('ArrowDown01')).toBe('arrow-down-01');
        expect(toLucideIconKebabName('Grid2x2')).toBe('grid-2x2');
        expect(toLucideIconKebabName('Axis3d')).toBe('axis-3d');
    });
});

describe('toLucideIconName', () => {
    it('normalizes kebab-case and PascalCase names', () => {
        expect(toLucideIconName('flask-conical')).toBe('FlaskConical');
        expect(toLucideIconName('Database')).toBe('Database');
    });
});

describe('resolveCollectionIconName', () => {
    it('falls back to the collection default for empty or unknown names', () => {
        expect(resolveCollectionIconName(null)).toBe(DEFAULT_COLLECTION_ICON);
        expect(resolveCollectionIconName('')).toBe(DEFAULT_COLLECTION_ICON);
        expect(resolveCollectionIconName('NotARealIcon')).toBe(
            DEFAULT_COLLECTION_ICON,
        );
        expect(resolveCollectionIconName('Database')).toBe('Database');
    });
});

describe('LucideIconPicker', () => {
    afterEach(cleanup);

    it('names every icon option and announces the selected one', () => {
        const onChange = vi.fn();

        render(
            <LucideIconPicker
                id="icon"
                label="Icon"
                value="Baby"
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Icon' }));

        expect(
            Array.from(
                document.querySelectorAll('[data-test^="icon-picker-option-"]'),
                (option) => option.getAttribute('aria-label'),
            ),
        ).toEqual(['Accessibility', 'Baby', 'Eye', 'Database']);
        expect(screen.getByRole('button', { name: 'Baby' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(
            screen.getByRole('button', { name: 'Accessibility' }),
        ).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'Accessibility' }));
        expect(onChange).toHaveBeenCalledWith('Accessibility');
    });

    it('shows an announced empty state when no icon matches', () => {
        render(
            <LucideIconPicker
                id="icon-empty"
                label="Icon"
                value=""
                onChange={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'zzzz-no-icon' },
        });

        expect(screen.getByRole('status')).toHaveTextContent(
            'collections.meta.noIconsFound',
        );
    });
});

describe('lucide icon catalog', () => {
    it('lists only icon names the picker can render', async () => {
        const catalog = await vi.importActual<{
            default: { categories: { icons: string[] }[] };
        }>('./lucide-icon-categories.json');
        const iconNames = catalog.default.categories.flatMap(
            (category) => category.icons,
        );

        expect(iconNames.length).toBeGreaterThan(1000);
        expect(
            iconNames.filter(
                (name) => resolveCollectionIconName(name) !== name,
            ),
        ).toEqual([]);
    });
});
