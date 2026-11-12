import { describe, expect, it } from 'vite-plus/test';
import {
    nextBlockTypeDefaults,
    nextNestedFieldName,
} from '@/components/collections/field-settings/type-settings/blocks-defaults';
import type { BlocksTypeDefinition } from '@/lib/collection-field-types';

function blockType(key: string): BlocksTypeDefinition {
    return { key, label: key, fields: [] };
}

describe('nextBlockTypeDefaults', () => {
    it('numbers the new block type after the existing ones', () => {
        expect(nextBlockTypeDefaults([blockType('hero')])).toEqual({
            key: 'block_2',
            label: 'Block 2',
            fields: [
                {
                    name: 'title',
                    type: 'string',
                    translatable: false,
                    settings: {},
                },
            ],
        });
    });

    it('skips keys that are already taken', () => {
        const next = nextBlockTypeDefaults([
            blockType('block_2'),
            blockType('block_3'),
        ]);

        expect(next.key).toBe('block_4');
        expect(next.label).toBe('Block 4');
    });
});

describe('nextNestedFieldName', () => {
    it('returns the first unused field_N name', () => {
        expect(nextNestedFieldName([])).toBe('field_1');
        expect(
            nextNestedFieldName([
                {
                    name: 'field_2',
                    type: 'string',
                    translatable: false,
                    settings: {},
                },
            ]),
        ).toBe('field_3');
    });
});
