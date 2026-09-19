import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { PaginatedMultiSelect } from '@/components/admin/paginated-multi-select';
import { Button } from '@/components/ui/button';
import { parseM2aFieldSettings } from '@/lib/collection-field-types';
import type { RelatedCollectionOption } from '@/lib/collection-field-types';
import { createSortableList } from '@/lib/create-sortable-list';
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
    id: string;
    related_collection_id: number;
    related_item_id: number;
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function newBlockId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        try {
            return crypto.randomUUID();
        } catch {
            // some embedded webviews expose the method but throw
        }
    }

    // ponytail: UUID v4 fallback when crypto.randomUUID is missing
    return `m2a-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
    const next = items.slice();
    const [item] = next.splice(from, 1);

    if (item === undefined) {
        return items;
    }

    next.splice(to, 0, item);

    return next;
}

function parseM2aBlocks(defaultValue: unknown): M2aBlock[] {
    if (!Array.isArray(defaultValue)) {
        return [];
    }

    return defaultValue.flatMap((entry) => {
        if (
            !entry ||
            typeof entry !== 'object' ||
            !isFiniteNumber(
                (entry as { related_collection_id?: unknown })
                    .related_collection_id,
            ) ||
            !isFiniteNumber(
                (entry as { related_item_id?: unknown }).related_item_id,
            )
        ) {
            return [];
        }

        return [
            {
                id: newBlockId(),
                related_collection_id: (
                    entry as {
                        related_collection_id: number;
                        related_item_id: number;
                    }
                ).related_collection_id,
                related_item_id: (
                    entry as {
                        related_collection_id: number;
                        related_item_id: number;
                    }
                ).related_item_id,
            },
        ];
    });
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
    const displayField =
        String(
            (field.settings as { display_field?: unknown } | null | undefined)
                ?.display_field ?? 'title',
        ).trim() || 'title';

    const [blocks, setBlocks] = useState<M2aBlock[]>(() =>
        parseM2aBlocks(defaultValue),
    );
    const blocksRef = useRef(blocks);
    const listRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        blocksRef.current = blocks;
    });

    const addBlock = () => {
        const firstCollection = allowedCollections[0];

        if (!firstCollection) {
            return;
        }

        setBlocks((current) => [
            ...current,
            {
                id: newBlockId(),
                related_collection_id: firstCollection.id,
                related_item_id: 0,
            },
        ]);
    };

    const updateBlock = (blockId: string, patch: Partial<M2aBlock>) => {
        setBlocks((current) =>
            current.map((block) =>
                block.id === blockId ? { ...block, ...patch } : block,
            ),
        );
    };

    const removeBlock = (blockId: string) => {
        setBlocks((current) => current.filter((block) => block.id !== blockId));
    };

    const moveBlock = (blockId: string, direction: -1 | 1) => {
        setBlocks((current) => {
            const index = current.findIndex((block) => block.id === blockId);
            const nextIndex = index + direction;

            if (index === -1 || nextIndex < 0 || nextIndex >= current.length) {
                return current;
            }

            return moveItem(current, index, nextIndex);
        });
    };

    const blocksKey = blocks.map((block) => block.id).join('\0');

    useEffect(() => {
        const el = listRef.current;

        if (!el || readonly || blocksKey === '') {
            return;
        }

        const sortable = createSortableList(el, {
            handle: '.drag-handle',
            onEnd: () => {
                const order = sortable.toArray();
                const prev = blocksRef.current.map((block) => block.id);

                if (
                    order.length === 0 ||
                    order.join('\0') === prev.join('\0')
                ) {
                    return;
                }

                setBlocks((current) => {
                    const byId = new Map(
                        current.map((block) => [block.id, block]),
                    );

                    return order
                        .map((id) => byId.get(id))
                        .filter((block): block is M2aBlock => !!block);
                });
            },
        });

        return () => sortable.destroy();
    }, [blocksKey, readonly]);

    return (
        <div className="space-y-3">
            <div ref={listRef} className="space-y-3">
                {blocks.map((block, blockIndex) => {
                    const fetchUrl = `/collections/${collectionId}/items/options?field_id=${field.id}&related_collection_id=${block.related_collection_id}&display_field=${encodeURIComponent(displayField)}`;
                    const selectedIds =
                        block.related_item_id > 0
                            ? [block.related_item_id]
                            : [];

                    return (
                        <div
                            key={block.id}
                            data-id={block.id}
                            className="space-y-2 rounded-lg border p-3"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                {!readonly ? (
                                    <button
                                        type="button"
                                        className="drag-handle text-muted-foreground"
                                        aria-label="Drag to reorder"
                                    >
                                        <GripVertical className="size-4" />
                                    </button>
                                ) : null}
                                <select
                                    className={cn(inputLike, 'max-w-xs')}
                                    value={block.related_collection_id}
                                    disabled={readonly}
                                    onChange={(event) =>
                                        updateBlock(block.id, {
                                            related_collection_id: Number(
                                                event.target.value,
                                            ),
                                            related_item_id: 0,
                                        })
                                    }
                                >
                                    {allowedCollections.map((collection) => (
                                        <option
                                            key={collection.id}
                                            value={collection.id}
                                        >
                                            {collection.name}
                                        </option>
                                    ))}
                                </select>
                                {!readonly ? (
                                    <div className="ml-auto flex gap-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={blockIndex === 0}
                                            aria-label="Move block up"
                                            onClick={() =>
                                                moveBlock(block.id, -1)
                                            }
                                        >
                                            <ArrowUp className="size-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={
                                                blockIndex === blocks.length - 1
                                            }
                                            aria-label="Move block down"
                                            onClick={() =>
                                                moveBlock(block.id, 1)
                                            }
                                        >
                                            <ArrowDown className="size-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                removeBlock(block.id)
                                            }
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
                                    updateBlock(block.id, {
                                        related_item_id: next[0] ?? 0,
                                    })
                                }
                                placeholder="Select block item…"
                            />
                        </div>
                    );
                })}
            </div>
            {blocks
                .filter((block) => block.related_item_id > 0)
                .map((block, index) => (
                    <Fragment key={`submit-${block.id}`}>
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
                <p className="text-sm text-muted-foreground">No blocks yet.</p>
            ) : null}
        </div>
    );
}
