import { GripVertical, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FIELD_TYPE_ICONS } from '@/components/collections/collection-field-form';
import {
    fieldsWithRowBreakOverrides,
    groupTreeNodesIntoLayoutRows,
} from '@/components/collections/fields-list/field-list-layout';
import {
    CollectionFieldRowActions,
    PanelAddSectionControl,
} from '@/components/collections/fields-list/field-row-actions';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { isLayoutGroupType } from '@/lib/collection-field-groups';
import type { FieldTreeNode } from '@/lib/collection-field-groups';
import {
    fieldLayoutWidthLabel,
    fieldStartsNewLayoutRow,
    fieldTypeLabel,
    getFieldDisplayName,
    getFieldGridColSpans,
    getFieldLayoutWidth,
    isFieldHiddenInForm,
    isFieldRequired,
} from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types';

/*
 * Rendering of the collection fields board: one field row, its sortable
 * wrapper, the nested group tree and the flat list. The `data-field-list`,
 * `data-group-parent` and `data-sortable-id` attributes are what the Sortable
 * hook reads back after a drop.
 */

/** Field-grid gap — enough air for between-item / between-group inserts. */
const FIELD_LIST_GAP_CLASS = 'gap-6';

const groupSurfaceClass =
    'space-y-2 rounded-lg border bg-muted/30 p-3 dark:border-sidebar-border';

type FieldRowProps = {
    field: CollectionFieldRow;
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    fillHeight?: boolean;
};

function CollectionFieldRow({
    field,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
    fillHeight = true,
}: FieldRowProps) {
    const { t } = useTranslation();
    const Icon = FIELD_TYPE_ICONS[field.type] ?? Type;
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);
    const isGroup = isLayoutGroupType(field.type);

    // Pattern: the field title is a stretched native <button> (its ::after
    // covers the row) that opens edit; the drag handle and the overflow menu
    // sit above it (`relative z-10`) as sibling controls, never nested.
    return (
        <Item
            variant={isGroup ? 'default' : 'outline'}
            size="sm"
            className={cn(
                'relative flex-nowrap gap-3 rounded-xl px-3 has-[[data-row-edit]:hover]:bg-muted/50',
                fillHeight && 'h-full',
                !isGroup &&
                    'border-sidebar-border/70 bg-card dark:border-sidebar-border',
                hiddenInForm && 'opacity-80',
            )}
        >
            <ItemMedia
                className={cn(
                    'drag-handle relative z-10 size-9 translate-y-0 self-center rounded-md text-muted-foreground',
                    reorderEnabled
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'pointer-events-none opacity-40',
                )}
                aria-hidden={!reorderEnabled}
                aria-label={
                    reorderEnabled ? t('a11y.dragToReorder') : undefined
                }
            >
                <GripVertical className="size-4" aria-hidden="true" />
            </ItemMedia>

            <ItemMedia
                variant="icon"
                className="size-10 translate-y-0 self-center rounded-lg bg-muted/30"
            >
                <Icon
                    className="size-5 text-muted-foreground"
                    aria-hidden="true"
                />
            </ItemMedia>
            <ItemContent className="min-w-0">
                <ItemTitle className="w-full">
                    <button
                        type="button"
                        data-row-edit
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit(field);
                        }}
                        className="min-w-0 cursor-pointer truncate text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                        {getFieldDisplayName(field.settings, field.name)}
                    </button>
                </ItemTitle>
                <ItemDescription className="truncate">
                    {fieldTypeLabel(field.type, t)}
                    {field.translatable
                        ? t('collections.translatableSuffix')
                        : ''}
                    {isFieldRequired(field.settings)
                        ? t('collections.requiredSuffix')
                        : ''}
                    {hiddenInForm ? t('collections.hiddenInFormSuffix') : ''}
                    {layoutWidth !== 'full'
                        ? ` · ${fieldLayoutWidthLabel(layoutWidth, t)}`
                        : ''}
                </ItemDescription>
            </ItemContent>

            <ItemActions className="relative z-10">
                <CollectionFieldRowActions
                    field={field}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    allFields={allFields}
                />
            </ItemActions>
        </Item>
    );
}

function FieldSortableItem({
    field,
    colSpan,
    forceNewRow,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
    nest,
}: {
    field: CollectionFieldRow;
    colSpan: 1 | 2;
    forceNewRow: boolean;
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    nest?: ReactNode;
}) {
    const isGroup = isLayoutGroupType(field.type);
    const isFullSpan = isGroup || colSpan === 2;

    return (
        <div
            data-sortable-id={field.id}
            data-field-name={field.name}
            data-field-type={field.type}
            data-layout-width={getFieldLayoutWidth(field.settings)}
            className={cn(
                'relative min-w-0',
                isFullSpan ? 'col-span-1 md:col-span-2' : 'col-span-1',
                forceNewRow && 'md:col-start-1',
                isGroup && groupSurfaceClass,
            )}
        >
            <CollectionFieldRow
                field={field}
                collectionId={collectionId}
                onEdit={onEdit}
                allFields={allFields}
                reorderEnabled={reorderEnabled}
                fillHeight={!isGroup}
            />
            {nest}
        </div>
    );
}

export function FieldTreeNodes({
    nodes,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
    rowBreakFieldIds,
    depth = 0,
}: {
    nodes: FieldTreeNode<CollectionFieldRow>[];
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    rowBreakFieldIds: Set<number>;
    depth?: number;
}) {
    const flatItems = groupTreeNodesIntoLayoutRows(nodes, rowBreakFieldIds);

    return (
        <div
            data-field-list
            data-group-parent=""
            data-tree-depth={depth}
            className={cn(
                'grid grid-cols-1 md:grid-cols-2',
                FIELD_LIST_GAP_CLASS,
            )}
        >
            {flatItems.map(({ node, colSpan, startsNewRow }, index) => {
                const forceNewRow = startsNewRow && index > 0;
                const isGroup = isLayoutGroupType(node.field.type);

                return (
                    <FieldSortableItem
                        key={node.field.id}
                        field={node.field}
                        colSpan={isGroup ? 2 : colSpan}
                        forceNewRow={forceNewRow}
                        collectionId={collectionId}
                        onEdit={onEdit}
                        allFields={allFields}
                        reorderEnabled={reorderEnabled}
                        nest={
                            isGroup ? (
                                <>
                                    <div
                                        data-field-list
                                        data-group-parent={node.field.name}
                                        className={cn(
                                            'mt-2 min-h-14 rounded-md px-2 py-2',
                                            'grid grid-cols-1 md:grid-cols-2',
                                            FIELD_LIST_GAP_CLASS,
                                        )}
                                    >
                                        {node.children.length > 0 ? (
                                            <NestedFieldItems
                                                nodes={node.children}
                                                collectionId={collectionId}
                                                onEdit={onEdit}
                                                allFields={allFields}
                                                reorderEnabled={reorderEnabled}
                                                rowBreakFieldIds={
                                                    rowBreakFieldIds
                                                }
                                            />
                                        ) : null}
                                    </div>
                                    <PanelAddSectionControl
                                        parent={node.field}
                                        collectionId={collectionId}
                                        allFields={allFields}
                                        empty={node.children.length === 0}
                                    />
                                </>
                            ) : undefined
                        }
                    />
                );
            })}
        </div>
    );
}

/** Children only — parent already owns the nest `[data-field-list]`. */
function NestedFieldItems({
    nodes,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
    rowBreakFieldIds,
}: {
    nodes: FieldTreeNode<CollectionFieldRow>[];
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    rowBreakFieldIds: Set<number>;
}) {
    const flatItems = groupTreeNodesIntoLayoutRows(nodes, rowBreakFieldIds);

    return (
        <>
            {flatItems.map(({ node, colSpan, startsNewRow }, index) => {
                const forceNewRow = startsNewRow && index > 0;
                const isGroup = isLayoutGroupType(node.field.type);

                return (
                    <FieldSortableItem
                        key={node.field.id}
                        field={node.field}
                        colSpan={isGroup ? 2 : colSpan}
                        forceNewRow={forceNewRow}
                        collectionId={collectionId}
                        onEdit={onEdit}
                        allFields={allFields}
                        reorderEnabled={reorderEnabled}
                        nest={
                            isGroup ? (
                                <>
                                    <div
                                        data-field-list
                                        data-group-parent={node.field.name}
                                        className={cn(
                                            'mt-2 min-h-14 rounded-md px-2 py-2',
                                            'grid grid-cols-1 md:grid-cols-2',
                                            FIELD_LIST_GAP_CLASS,
                                        )}
                                    >
                                        {node.children.length > 0 ? (
                                            <NestedFieldItems
                                                nodes={node.children}
                                                collectionId={collectionId}
                                                onEdit={onEdit}
                                                allFields={allFields}
                                                reorderEnabled={reorderEnabled}
                                                rowBreakFieldIds={
                                                    rowBreakFieldIds
                                                }
                                            />
                                        ) : null}
                                    </div>
                                    <PanelAddSectionControl
                                        parent={node.field}
                                        collectionId={collectionId}
                                        allFields={allFields}
                                        empty={node.children.length === 0}
                                    />
                                </>
                            ) : undefined
                        }
                    />
                );
            })}
        </>
    );
}

export function FlatFieldList({
    fields,
    collectionId,
    onEdit,
    reorderEnabled,
    rowBreakFieldIds,
}: {
    fields: CollectionFieldRow[];
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    reorderEnabled: boolean;
    rowBreakFieldIds: Set<number>;
}) {
    const layoutFields = fieldsWithRowBreakOverrides(fields, rowBreakFieldIds);
    const colSpans = getFieldGridColSpans(layoutFields);

    return (
        <div
            data-field-list
            data-group-parent=""
            className={cn(
                'grid grid-cols-1 md:grid-cols-2',
                FIELD_LIST_GAP_CLASS,
            )}
        >
            {layoutFields.map((field, fieldIndex) => {
                const forceNewRow =
                    fieldStartsNewLayoutRow(field.settings) && fieldIndex > 0;
                const colSpan = colSpans[fieldIndex] ?? 2;

                return (
                    <FieldSortableItem
                        key={field.id}
                        field={field}
                        colSpan={colSpan}
                        forceNewRow={forceNewRow}
                        collectionId={collectionId}
                        onEdit={onEdit}
                        allFields={fields}
                        reorderEnabled={reorderEnabled}
                    />
                );
            })}
        </div>
    );
}
