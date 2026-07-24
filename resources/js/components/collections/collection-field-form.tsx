import { Form } from '@inertiajs/react';
import {
    Calendar,
    CheckSquare,
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
    Search,
    SlidersHorizontal,
    ToggleLeft,
    Type,
    Tags,
    TextQuote,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { FieldConditionsSettings } from '@/components/collections/field-settings/field-conditions-settings';
import { CommonAdvancedSettings } from '@/components/collections/field-settings/common-advanced-settings';
import {
    SettingsDivider,
    SettingsPanel,
} from '@/components/collections/field-settings/settings-layout';
import { TranslatedInput } from '@/components/collections/field-settings/translated-input';
import { AltroSettings } from '@/components/collections/field-settings/type-settings/altro';
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
    DrawerClose,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    BLOCKS_ALLOWED_FIELD_TYPES,
    buildFieldSettingsPayload,
    COLLECTION_FIELD_TYPE_GROUPS,
    COLLECTION_FIELD_TYPES,
    fieldTypeNeedsBlocksSettings,
    fieldTypeGroupForType,
    fieldTypeNeedsOptions,
    fieldTypeNeedsTreeOptions,
    fieldTypeSupportsTranslatable,
    flattenSettingsForForm,
    isImageFieldMultiple,
    parseAllowedCollectionIds,
    parseBlocksFieldSettings,
    serializeBlocksFieldSettings,
    parseCommonFieldSettings,
    parseFieldOptions,
    parseFieldTreeOptions,
    parseSliderFieldSettings,
    parseSliderSettings,
    parseStringFieldSettings,
} from '@/lib/collection-field-types';
import type {BlocksTypeDefinition, CommonFieldSettings, CollectionFieldTypeOption, FieldOptionRow, FieldTreeOptionRow, RelatedCollectionOption, SliderFieldSettings, StringFieldSettings} from '@/lib/collection-field-types';
import type { FieldConditions } from '@/lib/field-conditions';
import { parseFieldConditions } from '@/lib/field-conditions';
import { wayfinderInertiaFormProps } from '@/lib/wayfinder-form';
import type { CollectionFieldRow } from '@/types';

const FIELD_TYPE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
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
    file: FileText,
    blocks: LayoutTemplate,
    m2a: LayoutTemplate,
    many_to_many: Network,
    one_to_many: Link2,
    relation_tree: ListTree,
    many_to_one: Link2,
    relation: Link2,
    relation_many: Link2,
    hash: Fingerprint,
    slider: SlidersHorizontal,
};

const TYPES_PER_ROW = 4;

function FieldTypePicker({ onSelect }: { onSelect: (type: string) => void }) {
    return (
        <div className="space-y-10">
            {COLLECTION_FIELD_TYPE_GROUPS.map((group) => {
                const rows: string[][] = [];

                for (
                    let index = 0;
                    index < group.types.length;
                    index += TYPES_PER_ROW
                ) {
                    rows.push(group.types.slice(index, index + TYPES_PER_ROW));
                }

                return (
                    <div key={group.label}>
                        <p className="mb-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {group.label}
                        </p>
                        <div className="flex flex-col gap-4">
                            {rows.map((rowTypes, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                                >
                                    {rowTypes.map((type) => {
                                        const Icon =
                                            FIELD_TYPE_ICONS[type] ?? Type;
                                        const option =
                                            COLLECTION_FIELD_TYPES.find(
                                                (fieldType) =>
                                                    fieldType.value === type,
                                            );

                                        return (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => onSelect(type)}
                                                className="flex flex-col items-center gap-2.5 rounded-lg border border-border px-3 py-5 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
                                            >
                                                <Icon className="size-6 text-muted-foreground" />
                                                <span className="text-xs leading-tight font-medium">
                                                    {option?.label ?? type}
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
    );
}

function fieldTypeMeta(fieldType: string): CollectionFieldTypeOption {
    return (
        COLLECTION_FIELD_TYPES.find(
            (option) => option.value === fieldType,
        ) ?? {
            value: fieldType,
            label: fieldType,
        }
    );
}

function FieldTypeHeader({
    fieldType,
    subtitle,
}: {
    fieldType: string;
    subtitle?: string;
}) {
    const Icon = FIELD_TYPE_ICONS[fieldType] ?? Type;
    const option = fieldTypeMeta(fieldType);

    return (
        <DrawerHeader>
            <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                    <Icon className="size-6 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <DrawerTitle>{option.label}</DrawerTitle>
                    <DrawerDescription>
                        {subtitle ?? option.description ?? 'Configure this field.'}
                    </DrawerDescription>
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
                onClick={() =>
                    onChange([...options, { value: '', label: '' }])
                }
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
        onChange(options.map((node, nodeIndex) => (nodeIndex === index ? updater(node) : node)));
    };

    return (
        <div className="space-y-4" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            {depth === 0 && (
                <div>
                    <Label>Tree choices</Label>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Define nested options. Parent and child nodes can be
                        selected independently in the form.
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

function nextBlockTypeDefaults(existing: BlocksTypeDefinition[]): BlocksTypeDefinition {
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

function BlocksSettingsEditor({
    blockTypes,
    onChange,
}: {
    blockTypes: BlocksTypeDefinition[];
    onChange: (next: BlocksTypeDefinition[]) => void;
}) {
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

    return (
        <div className="space-y-4">
            <div>
                <Label>Block types</Label>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Define the inline block schema for this field. Keys must be
                    lowercase snake_case (e.g. rich_text).
                </p>
            </div>

            {blockTypes.map((blockType, blockIndex) => (
                // ponytail: index keys — value-based keys remounted on every keystroke
                <div key={blockIndex} className="space-y-4 rounded-lg border p-4">
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
                                className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                            >
                                <Input
                                    value={field.name}
                                    placeholder="title"
                                    onChange={(event) =>
                                        updateBlock(blockIndex, {
                                            fields: blockType.fields.map(
                                                (entry, index) =>
                                                    index === fieldIndex
                                                        ? {
                                                              ...entry,
                                                              name: event.target
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
                                        const type = event.target.value;
                                        updateBlock(blockIndex, {
                                            fields: blockType.fields.map(
                                                (entry, index) =>
                                                    index === fieldIndex
                                                        ? {
                                                              ...entry,
                                                              type,
                                                              translatable:
                                                                  fieldTypeSupportsTranslatable(
                                                                      type,
                                                                  )
                                                                      ? entry.translatable
                                                                      : false,
                                                          }
                                                        : entry,
                                            ),
                                        });
                                    }}
                                    className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs"
                                >
                                    {BLOCKS_ALLOWED_FIELD_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {fieldTypeMeta(type).label}
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
                                            updateBlock(blockIndex, {
                                                fields: blockType.fields.map(
                                                    (entry, index) =>
                                                        index === fieldIndex
                                                            ? {
                                                                  ...entry,
                                                                  translatable:
                                                                      event
                                                                          .target
                                                                          .checked,
                                                              }
                                                            : entry,
                                                ),
                                            })
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
                                                    index !== fieldIndex,
                                            ),
                                        })
                                    }
                                >
                                    Remove
                                </Button>
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
                            disabled={blockIndex === blockTypes.length - 1}
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
                                        (_, index) => index !== blockIndex,
                                    ),
                                )
                            }
                        >
                            Delete block type
                        </Button>
                    </div>
                </div>
            ))}

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                    onChange([
                        ...blockTypes,
                        nextBlockTypeDefaults(blockTypes),
                    ])
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
    allowedCollectionIds: number[];
    onAllowedCollectionIdsChange: (next: number[]) => void;
    blockTypes: BlocksTypeDefinition[];
    onBlockTypesChange: (next: BlocksTypeDefinition[]) => void;
    sliderSettings: SliderFieldSettings;
    onSliderSettingsChange: (
        updater: (current: SliderFieldSettings) => SliderFieldSettings,
    ) => void;
    sliderShowValue: boolean;
    onSliderShowValueChange: (value: boolean) => void;
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
    allowedCollectionIds,
    onAllowedCollectionIdsChange,
    blockTypes,
    onBlockTypesChange,
    sliderSettings,
    onSliderSettingsChange,
    sliderShowValue,
    onSliderShowValueChange,
    siblingFieldNames,
    fieldConditions,
    onFieldConditionsChange,
}: FieldConfigPanelProps) {
    const typeGroup = fieldTypeGroupForType(fieldType);
    const typeMeta = fieldTypeMeta(fieldType);

    const typeSpecificContent = (
        <>
            {fieldTypeNeedsOptions(fieldType) &&
                !fieldTypeNeedsTreeOptions(fieldType) && (
                    <OptionsEditor options={options} onChange={onOptionsChange} />
                )}

            {fieldTypeNeedsTreeOptions(fieldType) && (
                <TreeOptionsEditor
                    options={treeOptions}
                    onChange={onTreeOptionsChange}
                />
            )}

            {fieldTypeNeedsBlocksSettings(fieldType) ? (
                <BlocksSettingsEditor blockTypes={blockTypes} onChange={onBlockTypesChange} />
            ) : null}

            {typeGroup === 'Text & numbers' ? (
                <TextNumbersSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    stringSettings={stringSettings}
                    onStringSettingsChange={onStringSettingsChange}
                />
            ) : null}

            {typeGroup === 'Selection' ? (
                <SelectionSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    booleanLabels={booleanLabels}
                    onBooleanLabelsChange={onBooleanLabelsChange}
                />
            ) : null}

            {typeGroup === 'Relational' ? (
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
                    allowedCollectionIds={allowedCollectionIds}
                    onAllowedCollectionIdsChange={onAllowedCollectionIdsChange}
                />
            ) : null}

            {typeGroup === 'Altro' ? (
                <AltroSettings
                    fieldType={fieldType}
                    settings={field?.settings}
                    sliderSettings={sliderSettings}
                    onSliderSettingsChange={onSliderSettingsChange}
                    sliderShowValue={sliderShowValue}
                    onSliderShowValueChange={onSliderShowValueChange}
                />
            ) : null}
        </>
    );

    const hasTypeSpecificSettings =
        (fieldTypeNeedsOptions(fieldType) &&
            !fieldTypeNeedsTreeOptions(fieldType)) ||
        fieldTypeNeedsTreeOptions(fieldType) ||
        fieldTypeNeedsBlocksSettings(fieldType) ||
        typeGroup === 'Text & numbers' ||
        typeGroup === 'Selection' ||
        typeGroup === 'Relational' ||
        typeGroup === 'Altro';

    return (
        <div className="space-y-6">
            <SettingsPanel
                title="General"
                description="Key, display name, and helper text for this field."
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
                            defaultValue={field?.name ?? ''}
                            placeholder="A unique column name…"
                            pattern="[a-z][a-z0-9_]*"
                            className="w-full"
                        />
                        <InputError message={errors.name} />
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
                        description="Optional helper text shown below the field label in the item form."
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

            <SettingsDivider label="Avanzate" />

            <SettingsPanel title="Field behavior">
                <CommonAdvancedSettings
                    fieldType={fieldType}
                    settings={commonSettings}
                    onChange={onCommonSettingsChange}
                />
            </SettingsPanel>

            <SettingsPanel
                title="Conditions"
                description="Hide, lock, or require this field based on other values."
            >
                <FieldConditionsSettings
                    settings={field?.settings}
                    siblingFieldNames={siblingFieldNames}
                    value={fieldConditions}
                    onChange={onFieldConditionsChange}
                />
            </SettingsPanel>

            {hasTypeSpecificSettings ? (
                <SettingsPanel
                    title={`${typeMeta.label} settings`}
                    description="Type-specific options for this field."
                >
                    <div className="space-y-6">{typeSpecificContent}</div>
                </SettingsPanel>
            ) : null}

            <SettingsPanel
                title="Validation"
                description="Rules checked when saving item content."
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
};

/**
 * Drawer for choosing a collection field type.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFieldTypeDrawer({
    onSelectType,
}: CollectionFieldTypeDrawerProps) {
    return (
        <>
            <DrawerHeader>
                <DrawerTitle>Create field</DrawerTitle>
                <DrawerDescription>
                    Choose a field type, then configure its settings.
                </DrawerDescription>
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
    onSuccess,
}: CollectionFieldFormDrawerProps) {
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
    const [booleanLabels, setBooleanLabels] = useState(() =>
        parseBooleanFieldSettings(field?.settings),
    );
    const [allowMultipleImages, setAllowMultipleImages] = useState(() =>
        isImageFieldMultiple(field?.settings),
    );
    const [allowedCollectionIds, setAllowedCollectionIds] = useState<number[]>(
        () => parseAllowedCollectionIds(field?.settings),
    );
    const [blockTypes, setBlockTypes] = useState<BlocksTypeDefinition[]>(
        () => parseBlocksFieldSettings(field?.settings).blockTypes,
    );
    const [sliderSettings, setSliderSettings] = useState<SliderFieldSettings>(
        () => parseSliderSettings(field?.settings),
    );
    const [sliderShowValue, setSliderShowValue] = useState(
        () => parseSliderFieldSettings(field?.settings).showValue,
    );
    const [fieldConditions, setFieldConditions] = useState<FieldConditions | null>(
        () => parseFieldConditions(field?.settings),
    );

    const settingsPayload = useMemo(() => {
        const typeSettings: Record<string, unknown> = {
            ...serializeTextNumbersTypeSettings(fieldType, stringSettings),
            ...serializeBooleanFieldSettings(booleanLabels),
        };

        if (fieldTypeGroupForType(fieldType) === 'Relational') {
            if (relatedCollectionId) {
                typeSettings.related_collection_id = relatedCollectionId;
            }

            if (displayField) {
                typeSettings.display_field = displayField;
            }

            if (fieldType === 'image') {
                typeSettings.allow_multiple = allowMultipleImages ? '1' : '0';
            }

            if (fieldType === 'm2a') {
                typeSettings.allowed_collection_ids = allowedCollectionIds;
            }
        }

        if (fieldType === 'blocks') {
            typeSettings.block_types = serializeBlocksFieldSettings(blockTypes);
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
        allowedCollectionIds,
        blockTypes,
        booleanLabels,
        commonSettings,
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
            <FieldTypeHeader
                fieldType={fieldType}
                subtitle={headerSubtitle}
            />

            <Form
                {...formProps}
                key={field?.id ?? `new-${fieldType}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                options={{ preserveScroll: true }}
                onSuccess={onSuccess}
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
                                booleanLabels={booleanLabels}
                                onBooleanLabelsChange={setBooleanLabels}
                                options={options}
                                onOptionsChange={setOptions}
                                treeOptions={treeOptions}
                                onTreeOptionsChange={setTreeOptions}
                                relatedCollections={relatedCollections}
                                relatedCollectionId={relatedCollectionId}
                                displayField={displayField}
                                onRelatedCollectionIdChange={setRelatedCollectionId}
                                onDisplayFieldChange={setDisplayField}
                                allowMultipleImages={allowMultipleImages}
                                onAllowMultipleImagesChange={setAllowMultipleImages}
                                allowedCollectionIds={allowedCollectionIds}
                                onAllowedCollectionIdsChange={setAllowedCollectionIds}
                                blockTypes={blockTypes}
                                onBlockTypesChange={setBlockTypes}
                                sliderSettings={sliderSettings}
                                onSliderSettingsChange={setSliderSettings}
                                sliderShowValue={sliderShowValue}
                                onSliderShowValueChange={setSliderShowValue}
                                siblingFieldNames={siblingFieldNames.filter(
                                    (name) => name !== field?.name,
                                )}
                                fieldConditions={fieldConditions}
                                onFieldConditionsChange={setFieldConditions}
                            />
                        </DrawerBody>

                        <DrawerFooter className="flex flex-row justify-end gap-3">
                            <DrawerClose asChild>
                                <Button type="button" variant="outline">
                                    Cancel
                                </Button>
                            </DrawerClose>
                            <Button type="submit" disabled={processing}>
                                {mode === 'create'
                                    ? 'Create field'
                                    : 'Save field'}
                            </Button>
                        </DrawerFooter>
                    </>
                )}
            </Form>
        </>
    );
}

export { FIELD_TYPE_ICONS };
