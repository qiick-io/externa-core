import type { BlocksTypeDefinition } from '@/lib/collection-field-types';

/** New block type with the first unused `block_N` key and one string field. */
export function nextBlockTypeDefaults(
    existing: BlocksTypeDefinition[],
): BlocksTypeDefinition {
    let blockNumber = existing.length + 1;
    let key = `block_${blockNumber}`;
    const used = new Set(existing.map((entry) => entry.key));

    while (used.has(key)) {
        blockNumber += 1;
        key = `block_${blockNumber}`;
    }

    return {
        key,
        label: `Block ${blockNumber}`,
        fields: [
            {
                name: 'title',
                type: 'string',
                translatable: false,
                settings: {},
            },
        ],
    };
}

/** First unused `field_N` name inside a block type. */
export function nextNestedFieldName(
    fields: BlocksTypeDefinition['fields'],
): string {
    let fieldNumber = fields.length + 1;
    let name = `field_${fieldNumber}`;
    const used = new Set(fields.map((field) => field.name));

    while (used.has(name)) {
        fieldNumber += 1;
        name = `field_${fieldNumber}`;
    }

    return name;
}
