import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type ReactNode } from 'react';

import { LocalizedField } from '@/components/collections/localized-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    getFieldDisplayName,
    getFieldNote,
    parseBlocksFieldSettings,
} from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';
import { Copy, GripVertical, Trash2 } from 'lucide-react';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

type FieldDef = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
    settings?: Record<string, unknown> | null;
};

type DefaultValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;

export type BlocksFieldRenderContext = {
    field: FieldDef;
    name: string;
    id: string;
    collectionId: number;
    locales: string[];
    readonly: boolean;
    defaultValue: DefaultValue;
    relatedCollections: RelatedCollectionOption[];
};

type BlocksFieldBlock = {
    id: string;
    type: string;
    data: Record<string, unknown>;
};

function FieldNote({
    settings,
    locales,
}: {
    settings?: Record<string, unknown> | null;
    locales: string[];
}) {
    const note = getFieldNote(settings, locales);

    if (!note) {
        return null;
    }

    return <p className="text-muted-foreground text-sm">{note}</p>;
}

function newBlockId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch {
            // some embedded webviews expose the method but throw
        }
    }

    // ponytail: UUID v4 fallback when crypto.randomUUID is missing (e.g. some webviews)
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseBlocksValue(defaultValue: unknown): BlocksFieldBlock[] {
    if (!Array.isArray(defaultValue)) {
        return [];
    }

    return defaultValue
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({
            id: typeof entry.id === 'string' && entry.id ? entry.id : newBlockId(),
            type: typeof entry.type === 'string' ? entry.type : '',
            data:
                entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
                    ? (entry.data as Record<string, unknown>)
                    : {},
        }))
        .filter((entry) => entry.type !== '');
}

function SortableBlocksItem({
    block,
    children,
}: {
    block: BlocksFieldBlock;
    children: (dragHandleProps: Record<string, unknown>) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: block.id,
    });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
        >
            {children({ ...attributes, ...listeners })}
        </div>
    );
}

export function BlocksFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    readonly,
    relatedCollections,
    locales,
    renderNestedField,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: unknown;
    readonly: boolean;
    relatedCollections: RelatedCollectionOption[];
    locales: string[];
    renderNestedField: (context: BlocksFieldRenderContext) => ReactNode;
}) {
    const blockTypes = parseBlocksFieldSettings(field.settings).blockTypes;
    const [blocks, setBlocks] = useState<BlocksFieldBlock[]>(() => parseBlocksValue(defaultValue));
    const sensors = useSensors(useSensor(PointerSensor));

    const addBlock = (type?: string) => {
        const nextType = type ?? blockTypes[0]?.key;
        if (!nextType) {
            return;
        }

        setBlocks((current) => [...current, { id: newBlockId(), type: nextType, data: {} }]);
    };

    const updateBlock = (blockId: string, patch: Partial<BlocksFieldBlock>) => {
        setBlocks((current) =>
            current.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
        );
    };

    const removeBlock = (blockId: string) => {
        setBlocks((current) => current.filter((block) => block.id !== blockId));
    };

    const duplicateBlock = (blockId: string) => {
        setBlocks((current) => {
            const index = current.findIndex((block) => block.id === blockId);
            if (index === -1) {
                return current;
            }

            const original = current[index];
            const duplicate = {
                ...original,
                id: newBlockId(),
                data: JSON.parse(JSON.stringify(original.data)) as Record<string, unknown>,
            };
            const next = [...current];
            next.splice(index + 1, 0, duplicate);

            return next;
        });
    };

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) {
            return;
        }

        setBlocks((current) => {
            const oldIndex = current.findIndex((block) => block.id === active.id);
            const newIndex = current.findIndex((block) => block.id === over.id);
            if (oldIndex === -1 || newIndex === -1) {
                return current;
            }

            return arrayMove(current, oldIndex, newIndex);
        });
    };

    return (
        <div className="space-y-4">
            {blocks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No blocks yet.</p>
            ) : null}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                        {blocks.map((block, index) => {
                            const schema = blockTypes.find((entry) => entry.key === block.type);
                            if (!schema) {
                                return null;
                            }

                            return (
                                <SortableBlocksItem key={block.id} block={block}>
                                    {(dragHandleProps) => (
                                        <div className="rounded-lg border p-4">
                                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                                {!readonly ? (
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground"
                                                        {...dragHandleProps}
                                                    >
                                                        <GripVertical className="size-4" />
                                                    </button>
                                                ) : null}
                                                <Badge variant="secondary">{schema.label}</Badge>
                                                <select
                                                    className={cn(inputLike, 'max-w-xs')}
                                                    value={block.type}
                                                    disabled={readonly}
                                                    onChange={(event) =>
                                                        updateBlock(block.id, {
                                                            type: event.target.value,
                                                            data: {},
                                                        })
                                                    }
                                                >
                                                    {blockTypes.map((entry) => (
                                                        <option key={entry.key} value={entry.key}>
                                                            {entry.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {!readonly ? (
                                                    <div className="ml-auto flex gap-1">
                                                        <Button type="button" size="sm" variant="ghost" onClick={() => duplicateBlock(block.id)}>
                                                            <Copy className="mr-1 size-4" /> Duplicate
                                                        </Button>
                                                        <Button type="button" size="sm" variant="ghost" onClick={() => removeBlock(block.id)}>
                                                            <Trash2 className="mr-1 size-4" /> Delete
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <input type="hidden" name={`${name}[${index}][id]`} value={block.id} />
                                            <input type="hidden" name={`${name}[${index}][type]`} value={block.type} />

                                            <div className="space-y-5">
                                                {schema.fields.map((nestedField) => {
                                                    const nestedFieldDef: FieldDef = {
                                                        id: field.id,
                                                        name: nestedField.name,
                                                        type: nestedField.type,
                                                        translatable: nestedField.translatable,
                                                        settings: nestedField.settings,
                                                    };
                                                    const nestedLabel = getFieldDisplayName(
                                                        nestedField.settings,
                                                        nestedField.name,
                                                        locales,
                                                    );
                                                    const nestedDefault =
                                                        (block.data[nestedField.name] as DefaultValue | undefined) ?? '';

                                                    if (nestedFieldDef.translatable) {
                                                        return (
                                                            <LocalizedField
                                                                key={`${block.id}-${nestedField.name}`}
                                                                locales={locales}
                                                                label={nestedLabel}
                                                                showCopyActions={false}
                                                            >
                                                                {({ locale }) => (
                                                                    <div className="space-y-2">
                                                                        <FieldNote settings={nestedFieldDef.settings} locales={locales} />
                                                                        {locales.map((code) => (
                                                                            <div
                                                                                key={code}
                                                                                className={code === locale ? 'grid gap-2' : 'hidden'}
                                                                            >
                                                                                {renderNestedField({
                                                                                    field: nestedFieldDef,
                                                                                    name: `${name}[${index}][data][${nestedField.name}][${code}]`,
                                                                                    id: `${field.name}_${block.id}_${nestedField.name}_${code}`,
                                                                                    collectionId,
                                                                                    locales,
                                                                                    readonly,
                                                                                    relatedCollections,
                                                                                    defaultValue:
                                                                                        nestedDefault &&
                                                                                        typeof nestedDefault === 'object' &&
                                                                                        !Array.isArray(nestedDefault)
                                                                                            ? ((nestedDefault as Record<string, unknown>)[code] as DefaultValue)
                                                                                            : '',
                                                                                })}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </LocalizedField>
                                                        );
                                                    }

                                                    return (
                                                        <div key={`${block.id}-${nestedField.name}`} className="space-y-2">
                                                            <Label htmlFor={`${field.name}_${block.id}_${nestedField.name}`}>
                                                                {nestedLabel}
                                                            </Label>
                                                            <FieldNote settings={nestedFieldDef.settings} locales={locales} />
                                                            {renderNestedField({
                                                                field: nestedFieldDef,
                                                                name: `${name}[${index}][data][${nestedField.name}]`,
                                                                id: `${field.name}_${block.id}_${nestedField.name}`,
                                                                collectionId,
                                                                locales,
                                                                readonly,
                                                                relatedCollections,
                                                                defaultValue: nestedDefault,
                                                            })}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </SortableBlocksItem>
                            );
                        })}
                    </div>
                </SortableContext>
            </DndContext>

            {!readonly ? (
                <div className="flex flex-wrap gap-2">
                    {blockTypes.map((blockType) => (
                        <Button
                            key={blockType.key}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addBlock(blockType.key)}
                        >
                            Add {blockType.label}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
