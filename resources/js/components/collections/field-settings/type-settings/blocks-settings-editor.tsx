import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldConditionsSettings } from '@/components/collections/field-settings/field-conditions-settings';
import {
    nextBlockTypeDefaults,
    nextNestedFieldName,
} from '@/components/collections/field-settings/type-settings/blocks-defaults';
import {
    NestedM2aSettings,
    NestedRelationSettings,
} from '@/components/collections/field-settings/type-settings/blocks-nested-settings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
    DEFAULT_BLOCKS_DEPTH,
    MAX_BLOCKS_DEPTH,
    blocksAllowedFieldTypesForDepth,
    fieldTypeLabel,
    fieldTypeSupportsTranslatable,
    parseBlocksFieldSettings,
} from '@/lib/collection-field-types';
import type {
    BlocksTypeDefinition,
    RelatedCollectionOption,
} from '@/lib/collection-field-types';
import { parseFieldConditions } from '@/lib/field-conditions';

/**
 * Block types of a blocks field: keys, labels, nested fields with their
 * settings and conditions, and nested blocks down to the max depth.
 */
export function BlocksSettingsEditor({
    blockTypes,
    onChange,
    depth = 1,
    maxDepth = DEFAULT_BLOCKS_DEPTH,
    onMaxDepthChange,
    relatedCollections = [],
}: {
    blockTypes: BlocksTypeDefinition[];
    onChange: (next: BlocksTypeDefinition[]) => void;
    depth?: number;
    maxDepth?: number;
    onMaxDepthChange?: (next: number) => void;
    relatedCollections?: RelatedCollectionOption[];
}) {
    const { t } = useTranslation();
    const cappedMax = Math.max(
        1,
        Math.min(MAX_BLOCKS_DEPTH, Math.trunc(maxDepth)),
    );
    const allowedTypes = blocksAllowedFieldTypesForDepth(depth, cappedMax);
    const canNestBlocks = depth < cappedMax;
    const [collapsedBlockIndexes, setCollapsedBlockIndexes] = useState<
        Set<number>
    >(
        () =>
            new Set(
                blockTypes
                    .map((blockType, index) =>
                        blockType.fields.length >= 4 ? index : -1,
                    )
                    .filter((index) => index >= 0),
            ),
    );

    const move = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction;

        if (nextIndex < 0 || nextIndex >= blockTypes.length) {
            return;
        }

        const next = [...blockTypes];
        const [moved] = next.splice(index, 1);
        next.splice(nextIndex, 0, moved);
        onChange(next);
    };

    const updateBlock = (
        blockIndex: number,
        patch: Partial<BlocksTypeDefinition>,
    ) => {
        const next = [...blockTypes];
        next[blockIndex] = { ...blockTypes[blockIndex], ...patch };
        onChange(next);
    };

    const toggleBlockCollapsed = (blockIndex: number) => {
        setCollapsedBlockIndexes((current) => {
            const next = new Set(current);

            if (next.has(blockIndex)) {
                next.delete(blockIndex);
            } else {
                next.add(blockIndex);
            }

            return next;
        });
    };

    return (
        <div className="space-y-4">
            <div>
                <Label>
                    {depth === 1
                        ? t('collections.fieldSettings.blocks.blockTypes')
                        : t('collections.fieldSettings.blocks.innerBlockTypes')}
                </Label>
                <p className="mt-2 text-sm text-muted-foreground">
                    {depth === 1
                        ? t('collections.fieldSettings.blocks.blockTypesHint', {
                              max: cappedMax,
                              ceiling: MAX_BLOCKS_DEPTH,
                          })
                        : t(
                              'collections.fieldSettings.blocks.innerBlockTypesHint',
                              {
                                  depth,
                                  max: cappedMax,
                              },
                          )}
                </p>
            </div>

            {depth === 1 && onMaxDepthChange ? (
                <Field className="max-w-xs">
                    <FieldLabel htmlFor="max_blocks_depth">
                        {t('collections.fieldSettings.blocks.maxDepth')}
                    </FieldLabel>
                    <Input
                        id="max_blocks_depth"
                        type="number"
                        min={1}
                        max={MAX_BLOCKS_DEPTH}
                        value={cappedMax}
                        onChange={(event) => {
                            const next = Number(event.target.value);

                            if (!Number.isFinite(next)) {
                                return;
                            }

                            onMaxDepthChange(
                                Math.max(
                                    1,
                                    Math.min(
                                        MAX_BLOCKS_DEPTH,
                                        Math.trunc(next),
                                    ),
                                ),
                            );
                        }}
                    />
                    <FieldDescription>
                        {t('collections.fieldSettings.blocks.maxDepthHint', {
                            default: DEFAULT_BLOCKS_DEPTH,
                            ceiling: MAX_BLOCKS_DEPTH,
                        })}
                    </FieldDescription>
                </Field>
            ) : null}

            {blockTypes.map((blockType, blockIndex) => {
                const collapsed = collapsedBlockIndexes.has(blockIndex);

                return (
                    // ponytail: index keys — value-based keys remounted on every keystroke
                    <div
                        key={blockIndex}
                        className="space-y-4 rounded-lg border p-4"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                className="text-muted-foreground"
                                aria-expanded={!collapsed}
                                aria-label={
                                    collapsed
                                        ? t(
                                              'collections.fieldSettings.blocks.expandBlockType',
                                          )
                                        : t(
                                              'collections.fieldSettings.blocks.collapseBlockType',
                                          )
                                }
                                onClick={() => toggleBlockCollapsed(blockIndex)}
                            >
                                {collapsed ? (
                                    <ChevronRight className="size-4" />
                                ) : (
                                    <ChevronDown className="size-4" />
                                )}
                            </button>
                            <span className="text-sm font-medium">
                                {blockType.label ||
                                    blockType.key ||
                                    t(
                                        'collections.fieldSettings.blocks.blockN',
                                        { n: blockIndex + 1 },
                                    )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {t(
                                    'collections.fieldSettings.blocks.fieldCount',
                                    {
                                        count: blockType.fields.length,
                                    },
                                )}
                            </span>
                        </div>

                        <div className={collapsed ? 'hidden' : 'space-y-4'}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field>
                                    <FieldLabel>
                                        {t(
                                            'collections.fieldSettings.form.key',
                                        )}
                                    </FieldLabel>
                                    <Input
                                        value={blockType.key}
                                        placeholder="rich_text"
                                        onChange={(event) =>
                                            updateBlock(blockIndex, {
                                                key: event.target.value,
                                            })
                                        }
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel>
                                        {t(
                                            'collections.fieldSettings.form.optionLabel',
                                        )}
                                    </FieldLabel>
                                    <Input
                                        value={blockType.label}
                                        placeholder={t(
                                            'collections.fieldSettings.blocks.labelPlaceholder',
                                        )}
                                        onChange={(event) =>
                                            updateBlock(blockIndex, {
                                                label: event.target.value,
                                            })
                                        }
                                    />
                                </Field>
                            </div>

                            <div className="space-y-3">
                                {blockType.fields.map((field, fieldIndex) => (
                                    <div
                                        key={fieldIndex}
                                        className="space-y-3 rounded-md border p-3"
                                    >
                                        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                                            <Input
                                                value={field.name}
                                                placeholder="title"
                                                onChange={(event) =>
                                                    updateBlock(blockIndex, {
                                                        fields: blockType.fields.map(
                                                            (entry, index) =>
                                                                index ===
                                                                fieldIndex
                                                                    ? {
                                                                          ...entry,
                                                                          name: event
                                                                              .target
                                                                              .value,
                                                                      }
                                                                    : entry,
                                                        ),
                                                    })
                                                }
                                            />
                                            <NativeSelect
                                                value={field.type}
                                                onChange={(event) => {
                                                    const type =
                                                        event.target.value;
                                                    updateBlock(blockIndex, {
                                                        fields: blockType.fields.map(
                                                            (entry, index) =>
                                                                index ===
                                                                fieldIndex
                                                                    ? {
                                                                          ...entry,
                                                                          type,
                                                                          translatable:
                                                                              fieldTypeSupportsTranslatable(
                                                                                  type,
                                                                              )
                                                                                  ? entry.translatable
                                                                                  : false,
                                                                          settings:
                                                                              type ===
                                                                              'blocks'
                                                                                  ? {
                                                                                        block_types:
                                                                                            parseBlocksFieldSettings(
                                                                                                entry.settings,
                                                                                            )
                                                                                                .blockTypes,
                                                                                    }
                                                                                  : {},
                                                                      }
                                                                    : entry,
                                                        ),
                                                    });
                                                }}
                                                className="w-full"
                                            >
                                                {allowedTypes.map((type) => (
                                                    <option
                                                        key={type}
                                                        value={type}
                                                    >
                                                        {fieldTypeLabel(
                                                            type,
                                                            t,
                                                        )}
                                                    </option>
                                                ))}
                                            </NativeSelect>
                                            <label className="flex items-center gap-2 text-sm">
                                                <Checkbox
                                                    checked={field.translatable}
                                                    disabled={
                                                        !fieldTypeSupportsTranslatable(
                                                            field.type,
                                                        )
                                                    }
                                                    onCheckedChange={(
                                                        isChecked,
                                                    ) =>
                                                        updateBlock(
                                                            blockIndex,
                                                            {
                                                                fields: blockType.fields.map(
                                                                    (
                                                                        entry,
                                                                        index,
                                                                    ) =>
                                                                        index ===
                                                                        fieldIndex
                                                                            ? {
                                                                                  ...entry,
                                                                                  translatable:
                                                                                      isChecked ===
                                                                                      true,
                                                                              }
                                                                            : entry,
                                                                ),
                                                            },
                                                        )
                                                    }
                                                />
                                                {t(
                                                    'collections.fieldSettings.blocks.i18n',
                                                )}
                                            </label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() =>
                                                    updateBlock(blockIndex, {
                                                        fields: blockType.fields.filter(
                                                            (_, index) =>
                                                                index !==
                                                                fieldIndex,
                                                        ),
                                                    })
                                                }
                                            >
                                                {t(
                                                    'collections.fieldSettings.blocks.remove',
                                                )}
                                            </Button>
                                        </div>

                                        {field.type === 'blocks' &&
                                        canNestBlocks ? (
                                            <div className="rounded-md bg-muted/30 p-3">
                                                <BlocksSettingsEditor
                                                    depth={depth + 1}
                                                    maxDepth={cappedMax}
                                                    relatedCollections={
                                                        relatedCollections
                                                    }
                                                    blockTypes={
                                                        parseBlocksFieldSettings(
                                                            field.settings,
                                                        ).blockTypes
                                                    }
                                                    onChange={(nextInner) =>
                                                        updateBlock(
                                                            blockIndex,
                                                            {
                                                                fields: blockType.fields.map(
                                                                    (
                                                                        entry,
                                                                        index,
                                                                    ) =>
                                                                        index ===
                                                                        fieldIndex
                                                                            ? {
                                                                                  ...entry,
                                                                                  settings:
                                                                                      {
                                                                                          block_types:
                                                                                              nextInner,
                                                                                      },
                                                                              }
                                                                            : entry,
                                                                ),
                                                            },
                                                        )
                                                    }
                                                />
                                            </div>
                                        ) : null}

                                        {field.type === 'm2a' ? (
                                            <NestedM2aSettings
                                                settings={field.settings}
                                                relatedCollections={
                                                    relatedCollections
                                                }
                                                onChange={(nextSettings) =>
                                                    updateBlock(blockIndex, {
                                                        fields: blockType.fields.map(
                                                            (entry, index) =>
                                                                index ===
                                                                fieldIndex
                                                                    ? {
                                                                          ...entry,
                                                                          settings:
                                                                              nextSettings,
                                                                      }
                                                                    : entry,
                                                        ),
                                                    })
                                                }
                                            />
                                        ) : null}

                                        {field.type === 'many_to_many' ||
                                        field.type === 'one_to_many' ? (
                                            <NestedRelationSettings
                                                settings={field.settings}
                                                relatedCollections={
                                                    relatedCollections
                                                }
                                                showJunctionFields={
                                                    field.type ===
                                                    'many_to_many'
                                                }
                                                onChange={(nextSettings) =>
                                                    updateBlock(blockIndex, {
                                                        fields: blockType.fields.map(
                                                            (entry, index) =>
                                                                index ===
                                                                fieldIndex
                                                                    ? {
                                                                          ...entry,
                                                                          settings:
                                                                              nextSettings,
                                                                      }
                                                                    : entry,
                                                        ),
                                                    })
                                                }
                                            />
                                        ) : null}

                                        <div className="border-t pt-3">
                                            <Label className="mb-2 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                {t(
                                                    'collections.fieldSettings.blocks.conditions',
                                                )}
                                            </Label>
                                            <FieldConditionsSettings
                                                settings={field.settings}
                                                siblingFieldNames={blockType.fields
                                                    .map((entry) =>
                                                        entry.name.trim(),
                                                    )
                                                    .filter(
                                                        (name) =>
                                                            name !== '' &&
                                                            name !==
                                                                field.name.trim(),
                                                    )}
                                                value={parseFieldConditions(
                                                    field.settings,
                                                )}
                                                onChange={(nextConditions) =>
                                                    updateBlock(blockIndex, {
                                                        fields: blockType.fields.map(
                                                            (entry, index) => {
                                                                if (
                                                                    index !==
                                                                    fieldIndex
                                                                ) {
                                                                    return entry;
                                                                }

                                                                const nextSettings =
                                                                    {
                                                                        ...entry.settings,
                                                                    };

                                                                if (
                                                                    nextConditions
                                                                ) {
                                                                    nextSettings.conditions =
                                                                        nextConditions;
                                                                } else {
                                                                    delete nextSettings.conditions;
                                                                }

                                                                return {
                                                                    ...entry,
                                                                    settings:
                                                                        nextSettings,
                                                                };
                                                            },
                                                        ),
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        updateBlock(blockIndex, {
                                            fields: [
                                                ...blockType.fields,
                                                {
                                                    name: nextNestedFieldName(
                                                        blockType.fields,
                                                    ),
                                                    type: 'string',
                                                    translatable: false,
                                                    settings: {},
                                                },
                                            ],
                                        })
                                    }
                                >
                                    {t(
                                        'collections.fieldSettings.blocks.addNestedField',
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={blockIndex === 0}
                                    onClick={() => move(blockIndex, -1)}
                                >
                                    {t(
                                        'collections.fieldSettings.blocks.moveUp',
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        blockIndex === blockTypes.length - 1
                                    }
                                    onClick={() => move(blockIndex, 1)}
                                >
                                    {t(
                                        'collections.fieldSettings.blocks.moveDown',
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        onChange(
                                            blockTypes.filter(
                                                (_, index) =>
                                                    index !== blockIndex,
                                            ),
                                        )
                                    }
                                >
                                    {t(
                                        'collections.fieldSettings.blocks.deleteBlockType',
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            })}

            <Button
                type="button"
                variant="outline"
                onClick={() =>
                    onChange([...blockTypes, nextBlockTypeDefaults(blockTypes)])
                }
            >
                {t('collections.fieldSettings.blocks.addBlockType')}
            </Button>
        </div>
    );
}
