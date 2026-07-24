import { Fragment, useState } from 'react';

import { PaginatedMultiSelect } from '@/components/admin/paginated-multi-select';
import { Button } from '@/components/ui/button';
import { parseM2aFieldSettings } from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

type FieldDef = {
    id: number;
    name: string;
    type: string;
    translatable: boolean;
    settings?: Record<string, unknown> | null;
};

type M2aBlock = {
    related_collection_id: number;
    related_item_id: number;
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function M2aFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    readonly,
    relatedCollections,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: unknown;
    readonly: boolean;
    relatedCollections: RelatedCollectionOption[];
}) {
    const m2aSettings = parseM2aFieldSettings(field.settings);
    const allowedCollections = relatedCollections.filter((collection) =>
        m2aSettings.allowedCollectionIds.includes(collection.id),
    );
    const displayField = String(
        (field.settings as { display_field?: unknown } | null | undefined)?.display_field ??
            'title',
    ).trim() || 'title';

    const [blocks, setBlocks] = useState<M2aBlock[]>(() => {
        if (!Array.isArray(defaultValue)) {
            return [];
        }

        return defaultValue.filter(
            (entry): entry is M2aBlock =>
                Boolean(entry) &&
                typeof entry === 'object' &&
                isFiniteNumber(
                    (entry as { related_collection_id?: unknown })
                        .related_collection_id,
                ) &&
                isFiniteNumber(
                    (entry as { related_item_id?: unknown }).related_item_id,
                ),
        );
    });

    const addBlock = () => {
        const firstCollection = allowedCollections[0];

        if (!firstCollection) {
            return;
        }

        setBlocks((current) => [
            ...current,
            {
                related_collection_id: firstCollection.id,
                related_item_id: 0,
            },
        ]);
    };

    const updateBlock = (index: number, patch: Partial<M2aBlock>) => {
        setBlocks((current) =>
            current.map((block, blockIndex) =>
                blockIndex === index ? { ...block, ...patch } : block,
            ),
        );
    };

    const removeBlock = (index: number) => {
        setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index));
    };

    const moveBlock = (index: number, direction: -1 | 1) => {
        setBlocks((current) => {
            const targetIndex = index + direction;

            if (targetIndex < 0 || targetIndex >= current.length) {
                return current;
            }

            const next = [...current];
            const [moved] = next.splice(index, 1);
            next.splice(targetIndex, 0, moved);

            return next;
        });
    };

    return (
        <div className="space-y-3">
            {blocks.map((block, blockIndex) => {
                const fetchUrl = `/collections/${collectionId}/items/options?field_id=${field.id}&related_collection_id=${block.related_collection_id}&display_field=${encodeURIComponent(displayField)}`;
                const selectedIds =
                    block.related_item_id > 0 ? [block.related_item_id] : [];

                return (
                    <div
                        key={`${blockIndex}-${block.related_collection_id}`}
                        className="space-y-2 rounded-lg border p-3"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                className={cn(inputLike, 'max-w-xs')}
                                value={block.related_collection_id}
                                disabled={readonly}
                                onChange={(event) =>
                                    updateBlock(blockIndex, {
                                        related_collection_id: Number(
                                            event.target.value,
                                        ),
                                        related_item_id: 0,
                                    })
                                }
                            >
                                {allowedCollections.map((collection) => (
                                    <option key={collection.id} value={collection.id}>
                                        {collection.name}
                                    </option>
                                ))}
                            </select>
                            {!readonly ? (
                                <div className="flex gap-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => moveBlock(blockIndex, -1)}
                                    >
                                        Up
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => moveBlock(blockIndex, 1)}
                                    >
                                        Down
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeBlock(blockIndex)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        <PaginatedMultiSelect
                            fetchUrl={fetchUrl}
                            value={selectedIds}
                            disabled={readonly}
                            multiple={false}
                            onChange={(next) =>
                                updateBlock(blockIndex, {
                                    related_item_id: next[0] ?? 0,
                                })
                            }
                            placeholder="Select block item…"
                        />
                    </div>
                );
            })}
            {blocks
                .filter((block) => block.related_item_id > 0)
                .map((block, index) => (
                    <Fragment key={`submit-${index}-${block.related_item_id}`}>
                        <input
                            type="hidden"
                            name={`${name}[${index}][related_collection_id]`}
                            value={block.related_collection_id}
                        />
                        <input
                            type="hidden"
                            name={`${name}[${index}][related_item_id]`}
                            value={block.related_item_id}
                        />
                    </Fragment>
                ))}
            {!readonly ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={allowedCollections.length === 0}
                    onClick={addBlock}
                >
                    Add block
                </Button>
            ) : null}
            {blocks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No blocks yet.</p>
            ) : null}
        </div>
    );
}
