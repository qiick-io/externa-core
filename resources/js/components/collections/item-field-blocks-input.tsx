import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    Copy,
    GripVertical,
    Trash2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { FieldNoteSlot } from '@/components/collections/item-field-choice-inputs';
import { LocalizedField } from '@/components/collections/localized-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    getFieldDisplayName,
    getFieldNote,
    effectiveMaxBlocksDepth,
    parseBlocksFieldSettings,
} from '@/lib/collection-field-types';
import type {
    BlocksTypeDefinition,
    RelatedCollectionOption,
} from '@/lib/collection-field-types';
import { createSortableList } from '@/lib/create-sortable-list';
import { evaluateFieldFlags } from '@/lib/field-conditions';
import { cn } from '@/lib/utils';

const inputLike =
    'border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none';

const SUMMARY_TEXT_TYPES = new Set([
    'string',
    'textarea',
    'wysiwyg',
    'markdown',
]);

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
    /** Depth of the parent blocks field; used when rendering nested blocks. */
    nestingDepth?: number;
    /** Root field max nesting (default 3, ceiling 5). */
    maxBlocksDepth?: number;
};

type BlocksFieldBlock = {
    id: string;
    type: string;
    data: Record<string, unknown>;
};

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

    // ponytail: UUID v4 fallback when crypto.randomUUID is missing (e.g. some webviews)
    const bytes = new Uint8Array(16);

    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.getRandomValues === 'function'
    ) {
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
        .filter(
            (entry): entry is Record<string, unknown> =>
                Boolean(entry) &&
                typeof entry === 'object' &&
                !Array.isArray(entry),
        )
        .map((entry) => ({
            id:
                typeof entry.id === 'string' && entry.id
                    ? entry.id
                    : newBlockId(),
            type: typeof entry.type === 'string' ? entry.type : '',
            data:
                entry.data &&
                typeof entry.data === 'object' &&
                !Array.isArray(entry.data)
                    ? (entry.data as Record<string, unknown>)
                    : {},
        }))
        .filter((entry) => entry.type !== '');
}

/** Strip HTML and truncate for block header preview (not a live site preview). */
function blockSummary(
    schema: BlocksTypeDefinition,
    data: Record<string, unknown>,
): string {
    const textField = schema.fields.find((field) =>
        SUMMARY_TEXT_TYPES.has(field.type),
    );

    if (!textField) {
        return '';
    }

    let raw: unknown = data[textField.name];

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const first = Object.values(raw as Record<string, unknown>).find(
            (value) => typeof value === 'string' && value.trim() !== '',
        );
        raw = first ?? '';
    }

    const text = String(raw ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (text === '') {
        return '';
    }

    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
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

export function BlocksFieldInput({
    collectionId,
    field,
    name,
    defaultValue,
    readonly,
    relatedCollections,
    locales,
    renderNestedField,
    depth = 1,
    maxBlocksDepth: maxBlocksDepthProp,
}: {
    collectionId: number;
    field: FieldDef;
    name: string;
    defaultValue: unknown;
    readonly: boolean;
    relatedCollections: RelatedCollectionOption[];
    locales: string[];
    renderNestedField: (context: BlocksFieldRenderContext) => ReactNode;
    /** Blocks nesting depth (1 = collection field). Cap at maxBlocksDepth. */
    depth?: number;
    /** Root field max nesting; falls back to settings / default 3. */
    maxBlocksDepth?: number;
}) {
    const blockTypes = parseBlocksFieldSettings(field.settings).blockTypes;
    const maxBlocksDepth =
        maxBlocksDepthProp ?? effectiveMaxBlocksDepth(field.settings);
    const [blocks, setBlocks] = useState<BlocksFieldBlock[]>(() =>
        parseBlocksValue(defaultValue),
    );
    const [siblingValues, setSiblingValues] = useState<
        Record<string, Record<string, unknown>>
    >(() => {
        const initial: Record<string, Record<string, unknown>> = {};

        for (const block of parseBlocksValue(defaultValue)) {
            initial[block.id] = { ...block.data };
        }

        return initial;
    });
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
        const initial = parseBlocksValue(defaultValue);

        // Nested lists: default collapsed when the list is long.
        if (depth > 1 && initial.length >= 3) {
            return new Set(initial.map((block) => block.id));
        }

        return new Set();
    });
    const listRef = useRef<HTMLDivElement>(null);
    const blocksRef = useRef(blocks);
    const nestingBlocked = depth > maxBlocksDepth;

    useLayoutEffect(() => {
        blocksRef.current = blocks;
    });

    const addBlock = (type?: string) => {
        const nextType = type ?? blockTypes[0]?.key;

        if (!nextType) {
            return;
        }

        const id = newBlockId();
        setBlocks((current) => [...current, { id, type: nextType, data: {} }]);
        setSiblingValues((current) => ({ ...current, [id]: {} }));
    };

    const updateBlock = (blockId: string, patch: Partial<BlocksFieldBlock>) => {
        setBlocks((current) =>
            current.map((block) =>
                block.id === blockId ? { ...block, ...patch } : block,
            ),
        );

        if (patch.data) {
            setSiblingValues((current) => ({
                ...current,
                [blockId]: { ...patch.data },
            }));
        } else if (patch.type !== undefined) {
            setSiblingValues((current) => ({ ...current, [blockId]: {} }));
        }
    };

    const updateSiblingValue = (
        blockId: string,
        fieldName: string,
        value: unknown,
    ) => {
        setSiblingValues((current) => ({
            ...current,
            [blockId]: {
                ...(current[blockId] ?? {}),
                [fieldName]: value,
            },
        }));
    };

    const removeBlock = (blockId: string) => {
        setBlocks((current) => current.filter((block) => block.id !== blockId));
        setCollapsedIds((current) => {
            if (!current.has(blockId)) {
                return current;
            }

            const next = new Set(current);
            next.delete(blockId);

            return next;
        });
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
                data: JSON.parse(JSON.stringify(original.data)) as Record<
                    string,
                    unknown
                >,
            };
            const next = [...current];
            next.splice(index + 1, 0, duplicate);

            return next;
        });
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

    const toggleCollapsed = (blockId: string) => {
        setCollapsedIds((current) => {
            const next = new Set(current);

            if (next.has(blockId)) {
                next.delete(blockId);
            } else {
                next.add(blockId);
            }

            return next;
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

                if (order.length === 0 || order.join('\0') === prev.join('\0')) {
                    return;
                }

                setBlocks((current) => {
                    const byId = new Map(
                        current.map((block) => [block.id, block]),
                    );

                    return order
                        .map((id) => byId.get(id))
                        .filter((block): block is BlocksFieldBlock => !!block);
                });
            },
        });

        return () => sortable.destroy();
    }, [blocksKey, readonly]);

    if (nestingBlocked) {
        return (
            <p className="text-sm text-muted-foreground">
                Blocks nesting exceeds the maximum depth ({maxBlocksDepth}).
            </p>
        );
    }

    return (
        <div
            className={cn(
                'space-y-4',
                depth > 1 && 'border-l-2 border-muted pl-3',
            )}
        >
            {blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No blocks yet.</p>
            ) : null}

            <div ref={listRef} className="space-y-3">
                        {blocks.map((block, index) => {
                            const schema = blockTypes.find(
                                (entry) => entry.key === block.type,
                            );

                            if (!schema) {
                                return null;
                            }

                            const collapsed = collapsedIds.has(block.id);
                            const summary = blockSummary(
                                schema,
                                siblingValues[block.id] ?? block.data,
                            );

                            return (
                                        <div
                                            key={block.id}
                                            data-id={block.id}
                                            className="rounded-lg border p-4"
                                        >
                                            <div className="mb-0 flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground"
                                                    aria-expanded={!collapsed}
                                                    aria-label={
                                                        collapsed
                                                            ? 'Expand block'
                                                            : 'Collapse block'
                                                    }
                                                    onClick={() =>
                                                        toggleCollapsed(
                                                            block.id,
                                                        )
                                                    }
                                                >
                                                    {collapsed ? (
                                                        <ChevronRight className="size-4" />
                                                    ) : (
                                                        <ChevronDown className="size-4" />
                                                    )}
                                                </button>
                                                {!readonly ? (
                                                    <button
                                                        type="button"
                                                        className="drag-handle text-muted-foreground"
                                                        aria-label="Drag to reorder"
                                                    >
                                                        <GripVertical className="size-4" />
                                                    </button>
                                                ) : null}
                                                <Badge variant="secondary">
                                                    {schema.label}
                                                </Badge>
                                                {collapsed && summary ? (
                                                    <span className="max-w-md truncate text-sm text-muted-foreground">
                                                        {summary}
                                                    </span>
                                                ) : null}
                                                <select
                                                    className={cn(
                                                        inputLike,
                                                        'max-w-xs',
                                                    )}
                                                    value={block.type}
                                                    disabled={readonly}
                                                    onChange={(event) =>
                                                        updateBlock(block.id, {
                                                            type: event.target
                                                                .value,
                                                            data: {},
                                                        })
                                                    }
                                                >
                                                    {blockTypes.map((entry) => (
                                                        <option
                                                            key={entry.key}
                                                            value={entry.key}
                                                        >
                                                            {entry.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {!readonly ? (
                                                    <div className="ml-auto flex gap-1">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={
                                                                index === 0
                                                            }
                                                            aria-label="Move block up"
                                                            onClick={() =>
                                                                moveBlock(
                                                                    block.id,
                                                                    -1,
                                                                )
                                                            }
                                                        >
                                                            <ArrowUp className="size-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={
                                                                index ===
                                                                blocks.length -
                                                                    1
                                                            }
                                                            aria-label="Move block down"
                                                            onClick={() =>
                                                                moveBlock(
                                                                    block.id,
                                                                    1,
                                                                )
                                                            }
                                                        >
                                                            <ArrowDown className="size-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                duplicateBlock(
                                                                    block.id,
                                                                )
                                                            }
                                                        >
                                                            <Copy className="mr-1 size-4" />{' '}
                                                            Duplicate
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                removeBlock(
                                                                    block.id,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 className="mr-1 size-4" />{' '}
                                                            Delete
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <input
                                                type="hidden"
                                                name={`${name}[${index}][id]`}
                                                value={block.id}
                                            />
                                            <input
                                                type="hidden"
                                                name={`${name}[${index}][type]`}
                                                value={block.type}
                                            />

                                            <div
                                                className={cn(
                                                    'mt-4 space-y-5',
                                                    collapsed && 'hidden',
                                                )}
                                            >
                                                {schema.fields.map(
                                                    (nestedField) => {
                                                        const nestedFieldDef: FieldDef =
                                                            {
                                                                id: field.id,
                                                                name: nestedField.name,
                                                                type: nestedField.type,
                                                                translatable:
                                                                    nestedField.translatable,
                                                                settings:
                                                                    nestedField.settings,
                                                            };
                                                        const siblingData =
                                                            siblingValues[
                                                                block.id
                                                            ] ?? block.data;
                                                        const flags =
                                                            evaluateFieldFlags(
                                                                nestedField.settings,
                                                                siblingData,
                                                            );

                                                        if (flags.hidden) {
                                                            return null;
                                                        }

                                                        const nestedLabel =
                                                            getFieldDisplayName(
                                                                nestedField.settings,
                                                                nestedField.name,
                                                                locales,
                                                            );
                                                        const nestedDefault =
                                                            (block.data[
                                                                nestedField.name
                                                            ] as
                                                                | DefaultValue
                                                                | undefined) ??
                                                            '';
                                                        const fieldReadonly =
                                                            readonly ||
                                                            flags.readonly;

                                                        if (
                                                            nestedFieldDef.translatable
                                                        ) {
                                                            return (
                                                                <LocalizedField
                                                                    key={`${block.id}-${nestedField.name}`}
                                                                    locales={
                                                                        locales
                                                                    }
                                                                    label={
                                                                        <>
                                                                            {
                                                                                nestedLabel
                                                                            }
                                                                            {flags.required ? (
                                                                                <span className="text-destructive">
                                                                                    {' '}
                                                                                    *
                                                                                </span>
                                                                            ) : null}
                                                                        </>
                                                                    }
                                                                    description={getFieldNote(
                                                                        nestedFieldDef.settings,
                                                                        locales,
                                                                    )}
                                                                    reserveDescriptionSpace
                                                                    showCopyActions={
                                                                        !fieldReadonly
                                                                    }
                                                                    namePrefix={`${name}[${index}][data][${nestedField.name}]`}
                                                                >
                                                                    {({
                                                                        locale,
                                                                    }) => (
                                                                        <div
                                                                            className="space-y-2"
                                                                            onInput={(
                                                                                event,
                                                                            ) => {
                                                                                const target =
                                                                                    event.target as
                                                                                        | HTMLInputElement
                                                                                        | HTMLTextAreaElement;

                                                                                if (
                                                                                    !target.name ||
                                                                                    target.type ===
                                                                                        'checkbox'
                                                                                ) {
                                                                                    return;
                                                                                }

                                                                                // ponytail: flat string for summary/conditions (ceiling: multi-locale sibling map)
                                                                                updateSiblingValue(
                                                                                    block.id,
                                                                                    nestedField.name,
                                                                                    target.value,
                                                                                );
                                                                            }}
                                                                        >
                                                                            {locales.map(
                                                                                (
                                                                                    code,
                                                                                ) => (
                                                                                    <div
                                                                                        key={
                                                                                            code
                                                                                        }
                                                                                        className={
                                                                                            code ===
                                                                                            locale
                                                                                                ? 'grid gap-2'
                                                                                                : 'hidden'
                                                                                        }
                                                                                    >
                                                                                        {renderNestedField(
                                                                                            {
                                                                                                field: nestedFieldDef,
                                                                                                name: `${name}[${index}][data][${nestedField.name}][${code}]`,
                                                                                                id: `${field.name}_${block.id}_${nestedField.name}_${code}`,
                                                                                                collectionId,
                                                                                                locales,
                                                                                                readonly:
                                                                                                    fieldReadonly,
                                                                                                relatedCollections,
                                                                                                defaultValue:
                                                                                                    nestedDefault &&
                                                                                                    typeof nestedDefault ===
                                                                                                        'object' &&
                                                                                                    !Array.isArray(
                                                                                                        nestedDefault,
                                                                                                    )
                                                                                                        ? ((
                                                                                                              nestedDefault as Record<
                                                                                                                  string,
                                                                                                                  unknown
                                                                                                              >
                                                                                                          )[
                                                                                                              code
                                                                                                          ] as DefaultValue)
                                                                                                        : '',
                                                                                                nestingDepth:
                                                                                                    depth +
                                                                                                    1,
                                                                                                maxBlocksDepth,
                                                                                            },
                                                                                        )}
                                                                                    </div>
                                                                                ),
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </LocalizedField>
                                                            );
                                                        }

                                                        return (
                                                            <div
                                                                key={`${block.id}-${nestedField.name}`}
                                                                className="space-y-2"
                                                                onInput={(
                                                                    event,
                                                                ) => {
                                                                    const target =
                                                                        event.target as
                                                                            | HTMLInputElement
                                                                            | HTMLSelectElement
                                                                            | HTMLTextAreaElement;

                                                                    if (
                                                                        target.type ===
                                                                        'checkbox'
                                                                    ) {
                                                                        return;
                                                                    }

                                                                    // SelectWithOtherInput: visible <select> has no name; value is in a hidden input updated next render.
                                                                    if (
                                                                        target.tagName ===
                                                                            'SELECT' &&
                                                                        !target.name
                                                                    ) {
                                                                        const selected =
                                                                            (
                                                                                target as HTMLSelectElement
                                                                            )
                                                                                .value;

                                                                        if (
                                                                            selected ===
                                                                            '__other__'
                                                                        ) {
                                                                            return;
                                                                        }

                                                                        updateSiblingValue(
                                                                            block.id,
                                                                            nestedField.name,
                                                                            selected,
                                                                        );

                                                                        return;
                                                                    }

                                                                    if (
                                                                        !target.name
                                                                    ) {
                                                                        return;
                                                                    }

                                                                    // ponytail: sibling condition re-eval (ceiling: no deep controlled tree)
                                                                    updateSiblingValue(
                                                                        block.id,
                                                                        nestedField.name,
                                                                        target.value,
                                                                    );
                                                                }}
                                                            >
                                                                <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <Label
                                                                            htmlFor={`${field.name}_${block.id}_${nestedField.name}`}
                                                                        >
                                                                            {
                                                                                nestedLabel
                                                                            }
                                                                            {flags.required ? (
                                                                                <span className="text-destructive">
                                                                                    {' '}
                                                                                    *
                                                                                </span>
                                                                            ) : null}
                                                                        </Label>
                                                                    </div>
                                                                </div>
                                                                {renderNestedField(
                                                                    {
                                                                        field: nestedFieldDef,
                                                                        name: `${name}[${index}][data][${nestedField.name}]`,
                                                                        id: `${field.name}_${block.id}_${nestedField.name}`,
                                                                        collectionId,
                                                                        locales,
                                                                        readonly:
                                                                            fieldReadonly,
                                                                        relatedCollections,
                                                                        defaultValue:
                                                                            nestedDefault,
                                                                        nestingDepth:
                                                                            depth +
                                                                            1,
                                                                        maxBlocksDepth,
                                                                    },
                                                                )}
                                                                <FieldNoteSlot
                                                                    note={getFieldNote(
                                                                        nestedFieldDef.settings,
                                                                        locales,
                                                                    )}
                                                                />
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </div>
                            );
                        })}
            </div>

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
