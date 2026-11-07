import { describe, expect, it } from 'vitest';
import {
    DEFAULT_COLLECTION_ICON,
    resolveCollectionIconName,
    toLucideIconKebabName,
    toLucideIconName,
} from './lucide-icon-picker';

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
