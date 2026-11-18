import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
    FIELD_INPUT_REGISTRY,
    renderFieldControl,
} from '@/components/collections/field-inputs/registry';
import { COLLECTION_FIELD_TYPE_GROUPS } from '@/lib/collection-field-types';

// The editor and map inputs import package CSS that the Node test runner cannot load.
vi.mock('@/components/collections/item-field-rich-inputs', () => ({
    CodeFieldInput: () => null,
    ColorFieldInput: () => null,
    MarkdownFieldInput: () => null,
    TagChipInput: () => null,
    WysiwygFieldInput: () => null,
}));
vi.mock('@/components/collections/map-coordinate-input', () => ({
    MapCoordinateInput: () => null,
}));

/** Backing values of App\Enums\FieldTypeEnum, the source of truth for field types. */
function fieldTypeEnumValues(): string[] {
    const enumSource = readFileSync(
        path.resolve(process.cwd(), 'app/Enums/FieldTypeEnum.php'),
        'utf8',
    );

    return [...enumSource.matchAll(/^\s*case\s+\w+\s*=\s*'([^']+)';/gm)].map(
        (match) => match[1],
    );
}

function renderControl(fieldType: string) {
    return render(
        <>
            {renderFieldControl({
                field: { id: 1, name: 'title', type: fieldType, settings: {} },
                name: 'data[title]',
                id: 'data_title',
                collectionId: 1,
                locales: ['en'],
                readonly: false,
                defaultValue: 'Hello',
                relatedCollections: [],
            })}
        </>,
    );
}

describe('FIELD_INPUT_REGISTRY', () => {
    it('has an input for every FieldTypeEnum value', () => {
        const enumValues = fieldTypeEnumValues();

        expect(enumValues.length).toBeGreaterThan(0);
        expect(
            enumValues.filter(
                (fieldType) => !Object.hasOwn(FIELD_INPUT_REGISTRY, fieldType),
            ),
        ).toEqual([]);
    });

    it('has no entry for a type the enum does not know', () => {
        const enumValues = new Set(fieldTypeEnumValues());

        expect(
            Object.keys(FIELD_INPUT_REGISTRY).filter(
                (fieldType) => !enumValues.has(fieldType),
            ),
        ).toEqual([]);
    });

    it('covers every type offered by the field type picker', () => {
        const pickerTypes = COLLECTION_FIELD_TYPE_GROUPS.flatMap(
            (group) => group.types,
        );

        expect(
            pickerTypes.filter(
                (fieldType) => !Object.hasOwn(FIELD_INPUT_REGISTRY, fieldType),
            ),
        ).toEqual([]);
    });
});

describe('renderFieldControl', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders the registered input for a known type', () => {
        renderControl('number');

        const input = screen.getByRole('spinbutton');

        expect(input).toHaveAttribute('name', 'data[title]');
        expect(input).toHaveAttribute('id', 'data_title');
    });

    it.each(['unknown_type', 'constructor'])(
        'falls back to a plain text input for %s',
        (fieldType) => {
            renderControl(fieldType);

            const input = screen.getByRole('textbox');

            expect(input).toHaveAttribute('type', 'text');
            expect(input).toHaveValue('Hello');
        },
    );
});
