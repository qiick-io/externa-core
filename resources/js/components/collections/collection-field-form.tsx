import { Form } from '@inertiajs/react';
import {
    Calendar,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Code2,
    FileText,
    Files,
    Fingerprint,
    Hash,
    Image,
    LayoutTemplate,
    Link2,
    List,
    ListTree,
    MapPin,
    Network,
    Palette,
    PanelsTopLeft,
    Rows3,
    Search,
    SlidersHorizontal,
    SquareStack,
    ToggleLeft,
    Type,
    Tags,
    TextQuote,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { CommonAdvancedSettings } from '@/components/collections/field-settings/common-advanced-settings';
import { FieldConditionsSettings } from '@/components/collections/field-settings/field-conditions-settings';
import {
    LucideIconByName,
    resolveCollectionIconName,
} from '@/components/collections/field-settings/lucide-icon-picker';
import {
    SettingsDivider,
    SettingsPanel,
} from '@/components/collections/field-settings/settings-layout';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import { AltroSettings } from '@/components/collections/field-settings/type-settings/altro';
import {
    GroupsSettings,
    parseAccordionGroupSettings,
    parseDetailGroupSettings,
    parseTabsGroupSettings,
    serializeGroupsTypeSettings,
} from '@/components/collections/field-settings/type-settings/groups';
import type {
    AccordionGroupSettings,
    DetailGroupSettings,
    TabsGroupSettings,
} from '@/components/collections/field-settings/type-settings/groups';
import { RelationalSettings } from '@/components/collections/field-settings/type-settings/relational';
import {
    parseBooleanFieldSettings,
    SelectionSettings,
    serializeBooleanFieldSettings,
} from '@/components/collections/field-settings/type-settings/selection';
import {
    serializeTextNumbersTypeSettings,
    TextNumbersSettings,
} from '@/components/collections/field-settings/type-settings/text-numbers';
import { ValidationRuleBuilder } from '@/components/collections/field-settings/validation-rule-builder';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    DrawerBody,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegisterUnsavedChanges } from '@/hooks/use-unsaved-changes';
import {
    DEFAULT_BLOCKS_DEPTH,
    MAX_BLOCKS_DEPTH,
    blocksAllowedFieldTypesForDepth,
    buildFieldSettingsPayload,
    COLLECTION_FIELD_TYPE_GROUPS,
    fieldTypeDescription,
    fieldTypeGroupForType,
    fieldTypeGroupLabelKey,
    fieldTypeLabel,
    fieldTypeNeedsBlocksSettings,
    fieldTypeNeedsOptions,
    fieldTypeNeedsTreeOptions,
    fieldTypeSupportsTranslatable,
    flattenSettingsForForm,
    isImageFieldMultiple,
    isFilesFieldMultiple,
    parseAllowedCollectionIds,
    parseApiAutocompleteFieldSettings,
    parseBlocksFieldSettings,
    serializeBlocksFieldSettings,
    parseCommonFieldSettings,
    parseFieldOptions,
    parseFieldTreeOptions,
    parseSliderFieldSettings,
    parseSliderSettings,
    parseStringFieldSettings,
} from '@/lib/collection-field-types';
import type {
    ApiAutocompleteFieldSettings,
    BlocksTypeDefinition,
    CommonFieldSettings,
    FieldOptionRow,
    FieldTreeOptionRow,
    RelatedCollectionOption,
    SliderFieldSettings,
    StringFieldSettings,
} from '@/lib/collection-field-types';
import type { FieldConditions } from '@/lib/field-conditions';
import { parseFieldConditions } from '@/lib/field-conditions';
import { FIELD_KEY_PATTERN, slugify, slugifyInput } from '@/lib/slugify';
import { STRING_LIMITS } from '@/lib/string-limits';
import { toast } from '@/lib/toast';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import type { CollectionFieldRow } from '@/types';
import { resolveCollectionColor } from '@/types';

const FIELD_TYPE_ICONS: Record<
    string,
    ComponentType<{ className?: string }>
> = {
    string: Type,
    autocomplete: Search,
    api_autocomplete: Search,
    number: Hash,
    boolean: ToggleLeft,
    textarea: FileText,
    wysiwyg: TextQuote,
    markdown: FileText,
    code: Code2,
    date: Calendar,
    map: MapPin,
    color: Palette,
    select: List,
    multiselect: List,
    checkbox_group: CheckSquare,
    checkbox_group_tree: ListTree,
    radio_group: List,
    tag: Tags,
    image: Image,
    files: Files,
    blocks: LayoutTemplate,
    m2a: LayoutTemplate,
    many_to_many: Network,
    one_to_many: Link2,
    many_to_one: Link2,
    hash: Fingerprint,
    slider: SlidersHorizontal,
    group_accordion: Rows3,
    group_detail: PanelsTopLeft,
    group_raw: SquareStack,
    group_tabs: LayoutTemplate,
};

const TYPES_PER_ROW = 4;

function fieldTypeMatchesQuery(
    type: string,
    query: string,
    t: (key: string, options?: { defaultValue?: string }) => string,
): boolean {
    const haystack = [
        type,
        fieldTypeLabel(type, t),
        fieldTypeDescription(type, t),
    ]
        .join(' ')
        .toLowerCase();

    return haystack.includes(query);
}

function FieldTypePicker({ onSelect }: { onSelect: (type: string) => void }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');

    const filteredGroups = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        if (normalized === '') {
            return COLLECTION_FIELD_TYPE_GROUPS;
        }

        return COLLECTION_FIELD_TYPE_GROUPS.map((group) => ({
            ...group,
            types: group.types.filter((type) =>
                fieldTypeMatchesQuery(type, normalized, t),
            ),
        })).filter((group) => group.types.length > 0);
    }, [query, t]);

    return (
        <div className="space-y-8">
            <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('collections.searchFieldTypes')}
                    maxLength={STRING_LIMITS.SEARCH}
                    className="pl-9"
                    autoFocus
                />
            </div>

            {filteredGroups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                    {t('collections.noMatchingFieldTypes')}
                </p>
            ) : (
                <div className="space-y-10">
                    {filteredGroups.map((group) => {
                        const rows: string[][] = [];

                        for (
                            let index = 0;
                            index < group.types.length;
                            index += TYPES_PER_ROW
                        ) {
                            rows.push(
                                group.types.slice(index, index + TYPES_PER_ROW),
                            );
                        }

                        return (
                            <div key={group.key}>
                                <p className="mb-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t(fieldTypeGroupLabelKey(group.key))}
                                </p>
                                <div className="flex flex-col gap-4">
                                    {rows.map((rowTypes, rowIndex) => (
                                        <div
                                            key={rowIndex}
                                            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                                        >
                                            {rowTypes.map((type) => {
                                                const Icon =
                                                    FIELD_TYPE_ICONS[type] ??
                                                    Type;

                                                return (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() =>
                                                            onSelect(type)
                                                        }
                                                        className="flex flex-col items-center gap-2.5 rounded-lg border border-border px-3 py-5 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
                                                    >
                                                        <Icon className="size-6 text-muted-foreground" />
                                                        <span className="text-xs leading-tight font-medium">
                                                            {fieldTypeLabel(
                                                                type,
                                                                t,
                                                            )}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function FieldTypeHeader({
    fieldType,
    subtitle,
}: {
    fieldType: string;
    subtitle?: string;
}) {
    const { t } = useTranslation();
    const Icon = FIELD_TYPE_ICONS[fieldType] ?? Type;
    const description =
        subtitle ??
        (fieldTypeDescription(fieldType, t) ||
            t('collections.typeSettingsDescription'));

    return (
        <DrawerHeader>
            <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                    <Icon className="size-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <DrawerTitle>{fieldTypeLabel(fieldType, t)}</DrawerTitle>
                    <DrawerDescription>{description}</DrawerDescription>
                </div>
            </div>
        </DrawerHeader>
    );
}

function OptionsEditor({
    options,
    onChange,
}: {
    options: FieldOptionRow[];
    onChange: (next: FieldOptionRow[]) => void;
}) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Choices</Label>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Add the values users can pick from. Label is shown in the
                    interface; value is stored in the database.
                </p>
            </div>
            <div className="space-y-3">
                {options.map((option, index) => (
                    <div key={index} className="flex gap-3">
                        <Input
                            placeholder="Value"
                            value={option.value}
                            onChange={(event) => {
                                const next = [...options];
                                next[index] = {
                                    ...next[index],
                                    value: event.target.value,
                                };
                                onChange(next);
                            }}
                        />
                        <Input
                            placeholder="Label"
                            value={option.label}
                            onChange={(event) => {
                                const next = [...options];
                                next[index] = {
                                    ...next[index],
                                    label: event.target.value,
                                };
                                onChange(next);
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={options.length === 1}
                            onClick={() =>
                                onChange(options.filter((_, i) => i !== index))
                            }
                            aria-label="Remove choice"
                        >
                            ×
                        </Button>
                    </div>
                ))}
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange([...options, { value: '', label: '' }])}
            >
                Add choice
            </Button>
        </div>
    );
}

function TreeOptionsEditor({
    options,
    onChange,
    depth = 0,
}: {
    options: FieldTreeOptionRow[];
    onChange: (next: FieldTreeOptionRow[]) => void;
    depth?: number;
}) {
    const updateNode = (
        index: number,
        updater: (node: FieldTreeOptionRow) => FieldTreeOptionRow,
    ): void => {
        onChange(
            options.map((node, nodeIndex) =>
                nodeIndex === index ? updater(node) : node,
            ),
        );
    };

    return (
        <div className="space-y-4" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            {depth === 0 && (
                <div>
                    <Label>Tree choices</Label>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Define nested options. Checking a parent selects all
                        descendants; mixed children show an indeterminate
                        parent.
                    </p>
                </div>
            )}

            {options.map((option, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                    <div className="flex gap-3">
                        <Input
                            placeholder="Value"
                            value={option.value}
                            onChange={(event) =>
                                updateNode(index, (node) => ({
                                    ...node,
                                    value: event.target.value,
                                }))
                            }
                        />
                        <Input
                            placeholder="Label"
                            value={option.label}
                            onChange={(event) =>
                                updateNode(index, (node) => ({
                                    ...node,
                                    label: event.target.value,
                                }))
                            }
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={depth === 0 && options.length === 1}
                            onClick={() =>
                                onChange(options.filter((_, i) => i !== index))
                            }
                            aria-label="Remove choice"
                        >
                            ×
                        </Button>
                    </div>

                    <TreeOptionsEditor
                        options={option.children ?? []}
                        depth={depth + 1}
                        onChange={(children) =>
                            updateNode(index, (node) => ({
                                ...node,
                                children,
                            }))
                        }
                    />

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            updateNode(index, (node) => ({
                                ...node,
                                children: [
                                    ...(node.children ?? []),
                                    { value: '', label: '', children: [] },
                                ],
                            }))
                        }
                    >
                        Add child
                    </Button>
                </div>
            ))}

            {depth === 0 && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        onChange([
                            ...options,
                            { value: '', label: '', children: [] },
                        ])
                    }
                >
                    Add root choice
                </Button>
            )}
        </div>
    );
}

function SettingsHiddenFields({
    settings,
}: {
    settings: Record<string, unknown>;
}) {
    const entries = flattenSettingsForForm(settings);

    return (
        <>
            {entries.map((entry) => (
                <input
                    key={entry.name}
                    type="hidden"
                    name={entry.name}
                    value={entry.value}
                />
            ))}
        </>
    );
}

function nextBlockTypeDefaults(
    existing: BlocksTypeDefinition[],
): BlocksTypeDefinition {
    let n = existing.length + 1;
    let key = `block_${n}`;
    const used = new Set(existing.map((entry) => entry.key));

    while (used.has(key)) {
        n += 1;
        key = `block_${n}`;
    }

    return {
        key,
        label: `Block ${n}`,
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

function nextNestedFieldName(fields: BlocksTypeDefinition['fields']): string {
    let n = fields.length + 1;
    let name = `field_${n}`;
    const used = new Set(fields.map((field) => field.name));

    while (used.has(name)) {
        n += 1;
        name = `field_${n}`;
    }

    return name;
}

function NestedRelationSettings({
    settings,
    relatedCollections,
    showJunctionFields,
    onChange,
}: {
    settings: Record<string, unknown>;
    relatedCollections: RelatedCollectionOption[];
    showJunctionFields?: boolean;
    onChange: (next: Record<string, unknown>) => void;
}) {
    const relatedCollectionId = String(settings.related_collection_id ?? '');
    const displayField = String(settings.display_field ?? 'title');
    const junctionJson = Array.isArray(settings.junction_fields)
        ? JSON.stringify(settings.junction_fields, null, 2)
        : typeof settings.junction_fields === 'string'
          ? settings.junction_fields
          : '';

    return (
        <div className="space-y-3 rounded-md bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
                Nested relations are stored as JSON links inside the block (not
                junction tables).
            </p>
            <div className="grid gap-2">
                <Label>Related collection</Label>
                <select
                    value={relatedCollectionId}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            related_collection_id: event.target.value
                                ? Number(event.target.value)
                                : null,
                        })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                >
                    <option value="">Select a collection…</option>
                    {relatedCollections.map((relatedCollection) => (
                        <option
                            key={relatedCollection.id}
                            value={String(relatedCollection.id)}
                        >
                            {relatedCollection.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="grid gap-2">
                <Label>Display field</Label>
                <Input
                    value={displayField}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            display_field: event.target.value,
                        })
                    }
                    placeholder="title"
                />
            </div>
            {showJunctionFields ? (
                <div className="grid gap-2">
                    <Label>Junction meta fields (JSON)</Label>
                    <textarea
                        value={junctionJson}
                        onChange={(event) => {
                            const raw = event.target.value;

                            try {
                                const parsed = JSON.parse(raw) as unknown;
                                onChange({
                                    ...settings,
                                    junction_fields: Array.isArray(parsed)
                                        ? parsed
                                        : raw,
                                });
                            } catch {
                                onChange({
                                    ...settings,
                                    junction_fields: raw,
                                });
                            }
                        }}
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs"
                        placeholder='[{"name":"caption","type":"string"}]'
                    />
                </div>
            ) : null}
        </div>
    );
}

function NestedM2aSettings({
    settings,
    relatedCollections,
    onChange,
}: {
    settings: Record<string, unknown>;
    relatedCollections: RelatedCollectionOption[];
    onChange: (next: Record<string, unknown>) => void;
}) {
    const allowedIds = parseAllowedCollectionIds(settings);
    const allowDuplicates =
        settings.allow_duplicates === true ||
        settings.allow_duplicates === 1 ||
        settings.allow_duplicates === '1';

    return (
        <div className="space-y-3 rounded-md bg-muted/30 p-3">
            <div>
                <Label>Allowed collections</Label>
                <div className="mt-2 space-y-2">
                    {relatedCollections.map((relatedCollection) => {
                        const checked = allowedIds.includes(
                            relatedCollection.id,
                        );

                        return (
                            <label
                                key={relatedCollection.id}
                                className="flex items-center gap-2 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                        const nextIds = event.target.checked
                                            ? [
                                                  ...allowedIds,
                                                  relatedCollection.id,
                                              ]
                                            : allowedIds.filter(
                                                  (id) =>
                                                      id !==
                                                      relatedCollection.id,
                                              );
                                        onChange({
                                            ...settings,
                                            allowed_collection_ids: nextIds,
                                        });
                                    }}
                                    className="size-4 rounded border"
                                />
                                {relatedCollection.name}
                            </label>
                        );
                    })}
                </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={allowDuplicates}
                    onChange={(event) =>
                        onChange({
                            ...settings,
                            allow_duplicates: event.target.checked ? '1' : '0',
                        })
                    }
                    className="size-4 rounded border"
                />
                Allow duplicate links
            </label>
        </div>
    );
}

function BlocksSettingsEditor({
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
                    {depth === 1 ? 'Block types' : 'Inner block types'}
                </Label>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {depth === 1
                        ? `Define the inline block schema for this field. Keys must be lowercase snake_case (e.g. rich_text). Nesting depth max ${cappedMax} (ceiling ${MAX_BLOCKS_DEPTH}).`
                        : `Inner blocks (depth ${depth}/${cappedMax}). Further blocks nesting is disabled at this depth.`}
                </p>
            </div>

            {depth === 1 && onMaxDepthChange ? (
                <div className="grid max-w-xs gap-2">
                    <Label htmlFor="max_blocks_depth">Max nesting depth</Label>
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
                    <p className="text-xs text-muted-foreground">
                        Default {DEFAULT_BLOCKS_DEPTH}. Absolute ceiling{' '}
                        {MAX_BLOCKS_DEPTH}.
                    </p>
                </div>
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
                                        ? 'Expand block type'
                                        : 'Collapse block type'
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
                                    `Block ${blockIndex + 1}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {blockType.fields.length} fields
                            </span>
                        </div>

                        <div className={collapsed ? 'hidden' : 'space-y-4'}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label>Key</Label>
                                    <Input
                                        value={blockType.key}
                                        placeholder="rich_text"
                                        onChange={(event) =>
                                            updateBlock(blockIndex, {
                                                key: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Label</Label>
                                    <Input
                                        value={blockType.label}
                                        placeholder="Rich text"
                                        onChange={(event) =>
                                            updateBlock(blockIndex, {
                                                label: event.target.value,
                                            })
                                        }
                                    />
                                </div>
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
                                            <select
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
                                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
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
                                            </select>
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={field.translatable}
                                                    disabled={
                                                        !fieldTypeSupportsTranslatable(
                                                            field.type,
                                                        )
                                                    }
                                                    onChange={(event) =>
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
                                                                                      event
                                                                                          .target
                                                                                          .checked,
                                                                              }
                                                                            : entry,
                                                                ),
                                                            },
                                                        )
                                                    }
                                                    className="size-4 rounded border"
                                                />
                                                I18n
                                            </label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
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
                                                Remove
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
                                                Conditions (vs siblings in this
                                                block)
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
                                    size="sm"
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
                                    Add nested field
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={blockIndex === 0}
                                    onClick={() => move(blockIndex, -1)}
                                >
                                    Up
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                        blockIndex === blockTypes.length - 1
                                    }
                                    onClick={() => move(blockIndex, 1)}
                                >
                                    Down
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
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
                                    Delete block type
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            })}

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                    onChange([...blockTypes, nextBlockTypeDefaults(blockTypes)])
                }
            >
                Add block type
            </Button>
        </div>
    );
}

type FieldConfigPanelProps = {
    mode: 'create' | 'edit';
    fieldType: string;
    field?: CollectionFieldRow;
    errors: Record<string, string | undefined>;
    commonSettings: CommonFieldSettings;
    onCommonSettingsChange: (
        updater: (current: CommonFieldSettings) => CommonFieldSettings,
    ) => void;
    stringSettings: StringFieldSettings;
    onStringSettingsChange: (
        updater: (current: StringFieldSettings) => StringFieldSettings,
    ) => void;
    apiAutocompleteSettings: ApiAutocompleteFieldSettings;
    onApiAutocompleteSettingsChange: (
        updater: (
            current: ApiAutocompleteFieldSettings,
        ) => ApiAutocompleteFieldSettings,
    ) => void;
    booleanLabels: ReturnType<typeof parseBooleanFieldSettings>;
    onBooleanLabelsChange: (
        next: ReturnType<typeof parseBooleanFieldSettings>,
    ) => void;
    options: FieldOptionRow[];
    onOptionsChange: (next: FieldOptionRow[]) => void;
    treeOptions: FieldTreeOptionRow[];
    onTreeOptionsChange: (next: FieldTreeOptionRow[]) => void;
    relatedCollections: RelatedCollectionOption[];
    relatedCollectionId: string;
    displayField: string;
    onRelatedCollectionIdChange: (value: string) => void;
    onDisplayFieldChange: (value: string) => void;
    allowMultipleImages: boolean;
    onAllowMultipleImagesChange: (value: boolean) => void;
    allowMultipleFiles: boolean;
    onAllowMultipleFilesChange: (value: boolean) => void;
    allowedCollectionIds: number[];
    onAllowedCollectionIdsChange: (next: number[]) => void;
    blockTypes: BlocksTypeDefinition[];
    onBlockTypesChange: (next: BlocksTypeDefinition[]) => void;
    maxBlocksDepth: number;
    onMaxBlocksDepthChange: (next: number) => void;
    sliderSettings: SliderFieldSettings;
    onSliderSettingsChange: (
        updater: (current: SliderFieldSettings) => SliderFieldSettings,
    ) => void;
    sliderShowValue: boolean;
    onSliderShowValueChange: (value: boolean) => void;
    accordionSettings: AccordionGroupSettings;
    onAccordionSettingsChange: (
        updater: (current: AccordionGroupSettings) => AccordionGroupSettings,
    ) => void;
    detailSettings: DetailGroupSettings;
    onDetailSettingsChange: (
        updater: (current: DetailGroupSettings) => DetailGroupSettings,
    ) => void;
    tabsSettings: TabsGroupSettings;
    onTabsSettingsChange: (
        updater: (current: TabsGroupSettings) => TabsGroupSettings,
    ) => void;
    siblingFieldNames: string[];
    fieldConditions: FieldConditions | null;
    onFieldConditionsChange: (next: FieldConditions | null) => void;
};

function FieldConfigPanel({
    mode,
    fieldType,
    field,
    errors,
    commonSettings,
    onCommonSettingsChange,
    stringSettings,
    onStringSettingsChange,
    apiAutocompleteSettings,
    onApiAutocompleteSettingsChange,
    booleanLabels,
    onBooleanLabelsChange,
    options,
    onOptionsChange,
    treeOptions,
    onTreeOptionsChange,
    relatedCollections,
    relatedCollectionId,
    displayField,
    onRelatedCollectionIdChange,
    onDisplayFieldChange,
    allowMultipleImages,
    onAllowMultipleImagesChange,
    allowMultipleFiles,
    onAllowMultipleFilesChange,
    allowedCollectionIds,
    onAllowedCollectionIdsChange,
    blockTypes,
    onBlockTypesChange,
    maxBlocksDepth,
    onMaxBlocksDepthChange,
    sliderSettings,
    onSliderSettingsChange,
    sliderShowValue,
    onSliderShowValueChange,
    accordionSettings,
    onAccordionSettingsChange,
    detailSettings,
    onDetailSettingsChange,
    tabsSettings,
    onTabsSettingsChange,
    siblingFieldNames,
    fieldConditions,
    onFieldConditionsChange,
}: FieldConfigPanelProps) {
    const { t } = useTranslation();
    const typeGroup = fieldTypeGroupForType(fieldType);
    const [fieldKey, setFieldKey] = useState(field?.name ?? '');
    const [debouncedKeyError, setDebouncedKeyError] = useState<
        string | undefined
    >();

    useEffect(() => {
        const handle = window.setTimeout(() => {
            // Trailing `-` while typing → compare the finalized slug; leave legacy `_` keys alone.
            const key = FIELD_KEY_PATTERN.test(fieldKey)
                ? fieldKey
                : slugify(fieldKey);

            if (key === '') {
                setDebouncedKeyError(undefined);

                return;
            }

            if (!FIELD_KEY_PATTERN.test(key)) {
                setDebouncedKeyError(
                    'Use lowercase letters, numbers, and hyphens (e.g. my-field).',
                );

                return;
            }

            if (siblingFieldNames.includes(key)) {
                setDebouncedKeyError(
                    'A field with this key already exists in this collection.',
                );

                return;
            }

            setDebouncedKeyError(undefined);
        }, 350);

        return () => window.clearTimeout(handle);
    }, [fieldKey, siblingFieldNames]);

    const nestedSettingsErrors = useMemo(
        () =>
            Object.entries(errors)
                .filter(
                    ([key, message]) =>
                        key.startsWith('settings.') && Boolean(message),
                )
                .map(([, message]) => message as string),
        [errors],
    );

    const keyError = errors.name ?? debouncedKeyError;

    const typeSpecificContent = (
        <>
            {fieldTypeNeedsOptions(fieldType) &&
                !fieldTypeNeedsTreeOptions(fieldType) && (
                    <OptionsEditor
                        options={options}
                        onChange={onOptionsChange}
                    />
                )}

            {fieldTypeNeedsTreeOptions(fieldType) && (
                <TreeOptionsEditor
                    options={treeOptions}
                    onChange={onTreeOptionsChange}
                />
            )}

            {fieldTypeNeedsBlocksSettings(fieldType) ? (
                <BlocksSettingsEditor
                    blockTypes={blockTypes}
                    onChange={onBlockTypesChange}
                    maxDepth={maxBlocksDepth}
                    onMaxDepthChange={onMaxBlocksDepthChange}
                    relatedCollections={relatedCollections}
                />
            ) : null}

            {typeGroup === 'text_numbers' ? (
                <TextNumbersSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    stringSettings={stringSettings}
                    onStringSettingsChange={onStringSettingsChange}
                    apiAutocompleteSettings={apiAutocompleteSettings}
                    onApiAutocompleteSettingsChange={
                        onApiAutocompleteSettingsChange
                    }
                />
            ) : null}

            {typeGroup === 'selection' ? (
                <SelectionSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    booleanLabels={booleanLabels}
                    onBooleanLabelsChange={onBooleanLabelsChange}
                />
            ) : null}

            {typeGroup === 'relational' ? (
                <RelationalSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    relatedCollections={relatedCollections}
                    relatedCollectionId={relatedCollectionId}
                    displayField={displayField}
                    onRelatedCollectionIdChange={onRelatedCollectionIdChange}
                    onDisplayFieldChange={onDisplayFieldChange}
                    allowMultipleImages={allowMultipleImages}
                    onAllowMultipleImagesChange={onAllowMultipleImagesChange}
                    allowMultipleFiles={allowMultipleFiles}
                    onAllowMultipleFilesChange={onAllowMultipleFilesChange}
                    allowedCollectionIds={allowedCollectionIds}
                    onAllowedCollectionIdsChange={onAllowedCollectionIdsChange}
                />
            ) : null}

            {typeGroup === 'other' ? (
                <AltroSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    sliderSettings={sliderSettings}
                    onSliderSettingsChange={onSliderSettingsChange}
                    sliderShowValue={sliderShowValue}
                    onSliderShowValueChange={onSliderShowValueChange}
                />
            ) : null}

            {typeGroup === 'groups' ? (
                <GroupsSettings
                    fieldType={fieldType}
                    accordionSettings={accordionSettings}
                    onAccordionSettingsChange={onAccordionSettingsChange}
                    detailSettings={detailSettings}
                    onDetailSettingsChange={onDetailSettingsChange}
                    tabsSettings={tabsSettings}
                    onTabsSettingsChange={onTabsSettingsChange}
                />
            ) : null}
        </>
    );

    const hasTypeSpecificSettings =
        (fieldTypeNeedsOptions(fieldType) &&
            !fieldTypeNeedsTreeOptions(fieldType)) ||
        fieldTypeNeedsTreeOptions(fieldType) ||
        fieldTypeNeedsBlocksSettings(fieldType) ||
        typeGroup === 'text_numbers' ||
        typeGroup === 'selection' ||
        typeGroup === 'relational' ||
        typeGroup === 'other' ||
        typeGroup === 'groups';

    return (
        <div className="space-y-6">
            <SettingsPanel
                title={t('collections.general')}
                description={t('collections.generalDescription')}
            >
                <div className="space-y-6">
                    <div className="grid gap-2.5">
                        <Label htmlFor={`field_name_${mode}`}>
                            Key <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id={`field_name_${mode}`}
                            name="name"
                            required
                            value={fieldKey}
                            onChange={(event) =>
                                setFieldKey(slugifyInput(event.target.value))
                            }
                            onBlur={() =>
                                setFieldKey((current) =>
                                    // Keep legacy underscore keys until the user edits them.
                                    FIELD_KEY_PATTERN.test(current)
                                        ? current
                                        : slugify(current),
                                )
                            }
                            placeholder="my-field"
                            pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*"
                            className="w-full"
                            aria-invalid={Boolean(keyError)}
                        />
                        <InputError message={keyError} />
                    </div>

                    <TranslatedInput
                        idPrefix={`display_name_${mode}`}
                        label="Name"
                        description="Translated label shown in the admin UI and item form."
                        value={commonSettings.displayName}
                        onChange={(displayName) =>
                            onCommonSettingsChange((current) => ({
                                ...current,
                                displayName,
                            }))
                        }
                    />

                    {fieldTypeSupportsTranslatable(fieldType) ? (
                        <TranslatableField mode={mode} field={field} />
                    ) : (
                        <input type="hidden" name="translatable" value="0" />
                    )}

                    <TranslatedInput
                        idPrefix={`note_${mode}`}
                        label="Note"
                        description="Optional helper text shown under the field control in the item form."
                        value={commonSettings.note}
                        onChange={(note) =>
                            onCommonSettingsChange((current) => ({
                                ...current,
                                note,
                            }))
                        }
                    />
                </div>
            </SettingsPanel>

            <SettingsDivider label={t('collections.advanced')} />

            {hasTypeSpecificSettings ? (
                <SettingsPanel
                    title={t('collections.typeSettings', {
                        type: fieldTypeLabel(fieldType, t),
                    })}
                    description={t('collections.typeSettingsDescription')}
                >
                    <div className="space-y-6">{typeSpecificContent}</div>
                </SettingsPanel>
            ) : null}

            <SettingsPanel title={t('collections.fieldBehavior')}>
                <CommonAdvancedSettings
                    fieldType={fieldType}
                    settings={commonSettings}
                    onChange={onCommonSettingsChange}
                />
            </SettingsPanel>

            <SettingsPanel
                title={t('collections.conditions')}
                description={t('collections.conditionsDescription')}
            >
                <FieldConditionsSettings
                    settings={field?.settings}
                    siblingFieldNames={siblingFieldNames}
                    value={fieldConditions}
                    onChange={onFieldConditionsChange}
                />
            </SettingsPanel>

            <SettingsPanel
                title={t('collections.validation')}
                description={t('collections.validationDescription')}
            >
                <ValidationRuleBuilder
                    rules={commonSettings.validationRules}
                    validationMessage={commonSettings.validationMessage}
                    onRulesChange={(validationRules) =>
                        onCommonSettingsChange((current) => ({
                            ...current,
                            validationRules,
                        }))
                    }
                    onValidationMessageChange={(validationMessage) =>
                        onCommonSettingsChange((current) => ({
                            ...current,
                            validationMessage,
                        }))
                    }
                />
            </SettingsPanel>

            <InputError message={errors.type} />
            <InputError message={errors.settings} />
            <InputError message={errors.translatable} />
            {nestedSettingsErrors.map((message) => (
                <InputError key={message} message={message} />
            ))}
        </div>
    );
}

function TranslatableField({
    mode,
    field,
}: {
    mode: 'create' | 'edit';
    field?: CollectionFieldRow;
}) {
    return (
        <div className="flex items-start gap-4">
            <input type="hidden" name="translatable" value="0" />
            <input
                id={`translatable_${mode}`}
                type="checkbox"
                name="translatable"
                value="1"
                defaultChecked={field?.translatable ?? false}
                className="mt-1 size-4 shrink-0 rounded border"
            />
            <div className="grid gap-2">
                <Label htmlFor={`translatable_${mode}`}>Translatable</Label>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    When enabled, editors enter a separate value for each
                    language (e.g. English and Italian) instead of a single
                    shared value.
                </p>
            </div>
        </div>
    );
}

export type CollectionFieldTypeDrawerProps = {
    onSelectType: (type: string) => void;
    collectionName: string;
    collectionIcon?: string | null;
    collectionColor?: string | null;
};

/**
 * Drawer for choosing a collection field type.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFieldTypeDrawer({
    onSelectType,
    collectionName,
    collectionIcon,
    collectionColor,
}: CollectionFieldTypeDrawerProps) {
    const { t } = useTranslation();
    const accent = resolveCollectionColor(collectionColor);

    return (
        <>
            <DrawerHeader>
                <div className="flex items-start gap-4">
                    <span
                        className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground"
                        style={
                            accent
                                ? {
                                      color: accent,
                                      borderColor: `${accent}55`,
                                      backgroundColor: `${accent}18`,
                                  }
                                : undefined
                        }
                        aria-hidden
                    >
                        <LucideIconByName
                            name={resolveCollectionIconName(collectionIcon)}
                            className="size-6"
                            style={accent ? { color: accent } : undefined}
                        />
                    </span>
                    <div className="min-w-0 flex-1">
                        <DrawerTitle>
                            {t('collections.addFieldFor', { name: collectionName })}
                        </DrawerTitle>
                        <DrawerDescription>
                            {t('collections.chooseFieldType')}
                        </DrawerDescription>
                    </div>
                </div>
            </DrawerHeader>

            <DrawerBody>
                <FieldTypePicker onSelect={onSelectType} />
            </DrawerBody>
        </>
    );
}

export type CollectionFieldFormDrawerProps = {
    mode: 'create' | 'edit';
    collectionId: number;
    field?: CollectionFieldRow;
    fieldType: string;
    relatedCollections: RelatedCollectionOption[];
    siblingFieldNames?: string[];
    /** Prefer over DrawerClose so leave goes through requestLeave. */
    onCancel: () => void;
    onSuccess: () => void;
};

/**
 * Drawer form for editing a collection field schema.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFieldFormDrawer({
    mode,
    collectionId,
    field,
    fieldType,
    relatedCollections,
    siblingFieldNames = [],
    onCancel,
    onSuccess,
}: CollectionFieldFormDrawerProps) {
    const { t } = useTranslation();
    const [options, setOptions] = useState<FieldOptionRow[]>(() =>
        parseFieldOptions(field?.settings),
    );
    const [treeOptions, setTreeOptions] = useState<FieldTreeOptionRow[]>(() =>
        parseFieldTreeOptions(field?.settings),
    );
    const [relatedCollectionId, setRelatedCollectionId] = useState(() =>
        String(field?.settings?.related_collection_id ?? ''),
    );
    const [displayField, setDisplayField] = useState(() =>
        String(field?.settings?.display_field ?? 'title'),
    );
    const [commonSettings, setCommonSettings] = useState<CommonFieldSettings>(
        () => parseCommonFieldSettings(field?.settings),
    );
    const [stringSettings, setStringSettings] = useState<StringFieldSettings>(
        () => parseStringFieldSettings(field?.settings),
    );
    const [apiAutocompleteSettings, setApiAutocompleteSettings] =
        useState<ApiAutocompleteFieldSettings>(() =>
            parseApiAutocompleteFieldSettings(field?.settings),
        );
    const [booleanLabels, setBooleanLabels] = useState(() =>
        parseBooleanFieldSettings(field?.settings),
    );
    const [allowMultipleImages, setAllowMultipleImages] = useState(() =>
        isImageFieldMultiple(field?.settings),
    );
    const [allowMultipleFiles, setAllowMultipleFiles] = useState(() =>
        isFilesFieldMultiple(field?.settings),
    );
    const [allowedCollectionIds, setAllowedCollectionIds] = useState<number[]>(
        () => parseAllowedCollectionIds(field?.settings),
    );
    const [blockTypes, setBlockTypes] = useState<BlocksTypeDefinition[]>(
        () => parseBlocksFieldSettings(field?.settings).blockTypes,
    );
    const [maxBlocksDepth, setMaxBlocksDepth] = useState(
        () => parseBlocksFieldSettings(field?.settings).maxBlocksDepth,
    );
    const [sliderSettings, setSliderSettings] = useState<SliderFieldSettings>(
        () => parseSliderSettings(field?.settings),
    );
    const [sliderShowValue, setSliderShowValue] = useState(
        () => parseSliderFieldSettings(field?.settings).showValue,
    );
    const [accordionSettings, setAccordionSettings] =
        useState<AccordionGroupSettings>(() =>
            parseAccordionGroupSettings(field?.settings),
        );
    const [detailSettings, setDetailSettings] = useState<DetailGroupSettings>(
        () => parseDetailGroupSettings(field?.settings),
    );
    const [tabsSettings, setTabsSettings] = useState<TabsGroupSettings>(() =>
        parseTabsGroupSettings(field?.settings),
    );
    const [fieldConditions, setFieldConditions] =
        useState<FieldConditions | null>(() =>
            parseFieldConditions(field?.settings),
        );

    const settingsPayload = useMemo(() => {
        const typeSettings: Record<string, unknown> = {
            ...serializeTextNumbersTypeSettings(
                fieldType,
                stringSettings,
                apiAutocompleteSettings,
            ),
            ...serializeBooleanFieldSettings(booleanLabels),
        };

        if (fieldTypeGroupForType(fieldType) === 'relational') {
            if (relatedCollectionId) {
                typeSettings.related_collection_id = relatedCollectionId;
            }

            if (displayField) {
                typeSettings.display_field = displayField;
            }

            if (fieldType === 'image') {
                typeSettings.allow_multiple = allowMultipleImages ? '1' : '0';
            }

            if (fieldType === 'files') {
                typeSettings.allow_multiple = allowMultipleFiles ? '1' : '0';
            }

            if (fieldType === 'm2a') {
                typeSettings.allowed_collection_ids = allowedCollectionIds;
            }
        }

        if (fieldType === 'blocks') {
            typeSettings.max_blocks_depth = maxBlocksDepth;
            typeSettings.block_types = serializeBlocksFieldSettings(
                blockTypes,
                1,
                maxBlocksDepth,
            );
        }

        if (fieldType === 'slider') {
            Object.assign(typeSettings, {
                min: sliderSettings.min,
                max: sliderSettings.max,
                step: sliderSettings.step,
                default_value: sliderSettings.defaultValue,
                show_value: sliderShowValue ? '1' : '0',
            });
        }

        Object.assign(
            typeSettings,
            serializeGroupsTypeSettings(
                fieldType,
                accordionSettings,
                detailSettings,
                tabsSettings,
            ),
        );

        const payload = buildFieldSettingsPayload(
            fieldType,
            commonSettings,
            typeSettings,
            options,
            treeOptions,
        );

        if (fieldConditions) {
            payload.conditions = fieldConditions;
        }

        return payload;
    }, [
        allowMultipleImages,
        allowMultipleFiles,
        allowedCollectionIds,
        apiAutocompleteSettings,
        accordionSettings,
        blockTypes,
        maxBlocksDepth,
        booleanLabels,
        commonSettings,
        detailSettings,
        tabsSettings,
        displayField,
        fieldConditions,
        fieldType,
        options,
        relatedCollectionId,
        sliderSettings,
        sliderShowValue,
        stringSettings,
        treeOptions,
    ]);

    // ponytail: snapshot compare for settings; Form onInput catches field key / native inputs
    const [initialSettingsSnapshot, setInitialSettingsSnapshot] = useState(() =>
        JSON.stringify(settingsPayload),
    );
    const [inputDirty, setInputDirty] = useState(false);
    const isDirty =
        inputDirty ||
        JSON.stringify(settingsPayload) !== initialSettingsSnapshot;

    useRegisterUnsavedChanges({
        scope: 'drawer',
        isDirty,
        onDiscard: () => setInputDirty(false),
    });

    const formProps =
        mode === 'create'
            ? wayfinderInertiaFormProps(
                  FieldController.store,
                  { collection: collectionId },
                  'post',
              )
            : wayfinderInertiaFormProps(
                  FieldController.update,
                  {
                      collection: collectionId,
                      field: field!.id,
                  },
                  'patch',
              );

    const headerSubtitle =
        mode === 'edit' && field !== undefined
            ? `Update settings for ${field.name}.`
            : undefined;

    return (
        <>
            <FieldTypeHeader fieldType={fieldType} subtitle={headerSubtitle} />

            <Form
                {...formProps}
                key={field?.id ?? `new-${fieldType}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                options={{ preserveScroll: true }}
                onSuccess={() => {
                    // flushSync: parent onSuccess closes drawer + deepLink GET before
                    // the next paint; without it the leave guard still sees dirty.
                    flushSync(() => {
                        setInputDirty(false);
                        setInitialSettingsSnapshot(
                            JSON.stringify(settingsPayload),
                        );
                    });
                    onSuccess();
                }}
                onInput={() => setInputDirty(true)}
                onChange={() => setInputDirty(true)}
                onError={(formErrors) => {
                    const first = Object.values(formErrors).find(
                        (message) =>
                            typeof message === 'string' && message !== '',
                    );

                    toast.error(
                        typeof first === 'string'
                            ? first
                            : 'Could not save field. Check the form for errors.',
                    );
                }}
            >
                {({ processing, errors }) => (
                    <>
                        <input type="hidden" name="type" value={fieldType} />
                        <SettingsHiddenFields settings={settingsPayload} />

                        <DrawerBody className="flex flex-col gap-8">
                            <FieldConfigPanel
                                mode={mode}
                                fieldType={fieldType}
                                field={field}
                                errors={errors}
                                commonSettings={commonSettings}
                                onCommonSettingsChange={setCommonSettings}
                                stringSettings={stringSettings}
                                onStringSettingsChange={setStringSettings}
                                apiAutocompleteSettings={
                                    apiAutocompleteSettings
                                }
                                onApiAutocompleteSettingsChange={
                                    setApiAutocompleteSettings
                                }
                                booleanLabels={booleanLabels}
                                onBooleanLabelsChange={setBooleanLabels}
                                options={options}
                                onOptionsChange={setOptions}
                                treeOptions={treeOptions}
                                onTreeOptionsChange={setTreeOptions}
                                relatedCollections={relatedCollections}
                                relatedCollectionId={relatedCollectionId}
                                displayField={displayField}
                                onRelatedCollectionIdChange={
                                    setRelatedCollectionId
                                }
                                onDisplayFieldChange={setDisplayField}
                                allowMultipleImages={allowMultipleImages}
                                onAllowMultipleImagesChange={
                                    setAllowMultipleImages
                                }
                                allowMultipleFiles={allowMultipleFiles}
                                onAllowMultipleFilesChange={
                                    setAllowMultipleFiles
                                }
                                allowedCollectionIds={allowedCollectionIds}
                                onAllowedCollectionIdsChange={
                                    setAllowedCollectionIds
                                }
                                blockTypes={blockTypes}
                                onBlockTypesChange={setBlockTypes}
                                maxBlocksDepth={maxBlocksDepth}
                                onMaxBlocksDepthChange={setMaxBlocksDepth}
                                sliderSettings={sliderSettings}
                                onSliderSettingsChange={setSliderSettings}
                                sliderShowValue={sliderShowValue}
                                onSliderShowValueChange={setSliderShowValue}
                                accordionSettings={accordionSettings}
                                onAccordionSettingsChange={setAccordionSettings}
                                detailSettings={detailSettings}
                                onDetailSettingsChange={setDetailSettings}
                                tabsSettings={tabsSettings}
                                onTabsSettingsChange={setTabsSettings}
                                siblingFieldNames={siblingFieldNames.filter(
                                    (name) => name !== field?.name,
                                )}
                                fieldConditions={fieldConditions}
                                onFieldConditionsChange={setFieldConditions}
                            />
                        </DrawerBody>

                        <DrawerFooter className="flex flex-row justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {mode === 'create'
                                    ? t('collections.createField')
                                    : t('collections.saveField')}
                            </Button>
                        </DrawerFooter>
                    </>
                )}
            </Form>
        </>
    );
}

export { FIELD_TYPE_ICONS };
