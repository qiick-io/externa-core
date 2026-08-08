import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    PointerSensor,
    pointerWithin,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type {
    CollisionDetection,
    DragEndEvent,
    DragOverEvent,
    DragStartEvent,
    UniqueIdentifier,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { router } from '@inertiajs/react';
import {
    Check,
    Columns2,
    Copy,
    Eye,
    EyeOff,
    GripVertical,
    Maximize2,
    MoreHorizontal,
    Pencil,
    Plus,
    StretchHorizontal,
    Trash2,
    Type,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { FIELD_TYPE_ICONS } from '@/components/collections/collection-field-form';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    fieldLayoutWidthLabel,
    fieldStartsNewLayoutRow,
    fieldTypeLabel,
    getFieldDisplayName,
    getFieldGridColSpans,
    getFieldLayoutWidth,
    groupFieldsIntoLayoutRows,
    isFieldHiddenInForm,
    isFieldRequired,
} from '@/lib/collection-field-types';
import type { FieldLayoutWidth } from '@/lib/collection-field-types';
import {
    buildFieldTree,
    fieldsWithGroupOverrides,
    getFieldGroupName,
    isLayoutGroupType,
    isPanelContainerType,
    moveFieldInGroupTree,
    wouldCreateGroupCycle,
} from '@/lib/collection-field-groups';
import type { FieldTreeNode } from '@/lib/collection-field-groups';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types';

/** Droppable id for a group's interior nest zone (body only, not header). */
const GROUP_DROP_PREFIX = 'group-drop:';

function groupDropId(fieldId: number): string {
    return `${GROUP_DROP_PREFIX}${fieldId}`;
}

function parseGroupDropId(id: UniqueIdentifier): number | null {
    const raw = String(id);

    if (!raw.startsWith(GROUP_DROP_PREFIX)) {
        return null;
    }

    const fieldId = Number(raw.slice(GROUP_DROP_PREFIX.length));

    return Number.isFinite(fieldId) ? fieldId : null;
}

function uniqueFieldName(used: Set<string>, base: string): string {
    if (!used.has(base)) {
        return base;
    }

    let suffix = 2;
    while (used.has(`${base}_${suffix}`)) {
        suffix++;
    }

    return `${base}_${suffix}`;
}

/**
 * Create a Raw section/tab under Accordion/Tabs (Directus: nest group-raw).
 * Uses field store — same path as Add layout → Raw group + nest.
 */
function createPanelSectionField(
    collectionId: number,
    parent: CollectionFieldRow,
    allFields: CollectionFieldRow[],
): void {
    if (!isPanelContainerType(parent.type)) {
        return;
    }

    const childCount = allFields.filter(
        (field) => getFieldGroupName(field) === parent.name,
    ).length;
    const index = childCount + 1;
    const isTabs = parent.type === 'group_tabs';
    const baseName = isTabs
        ? `${parent.name}_tab_${index}`
        : `${parent.name}_section_${index}`;
    const used = new Set(allFields.map((field) => field.name));
    const name = uniqueFieldName(used, baseName);

    router.post(
        FieldController.store.url(collectionId),
        {
            name,
            type: 'group_raw',
            translatable: false,
            settings: {
                layout_width: 'full',
                group: parent.name,
                display_name: isTabs
                    ? {
                          en: `Tab ${index}`,
                          it: `Scheda ${index}`,
                          de: `Tab ${index}`,
                      }
                    : {
                          en: `Section ${index}`,
                          it: `Sezione ${index}`,
                          de: `Abschnitt ${index}`,
                      },
            },
        },
        { preserveScroll: true },
    );
}

/**
 * Prefer innermost group-drop body; otherwise the field under the pointer.
 * Falls back to closestCenter for gaps between items.
 */
const sortableFieldsCollisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);

    if (pointerCollisions.length > 0) {
        const groupDrops = pointerCollisions.filter((collision) =>
            String(collision.id).startsWith(GROUP_DROP_PREFIX),
        );

        if (groupDrops.length > 0) {
            // Innermost body: smallest measured rect under the pointer.
            let chosen = groupDrops[0];
            let chosenArea = Number.POSITIVE_INFINITY;

            for (const collision of groupDrops) {
                const container = args.droppableContainers.find(
                    (entry) => entry.id === collision.id,
                );
                const rect = container?.rect.current;

                if (!rect) {
                    continue;
                }

                const area = rect.width * rect.height;

                if (area < chosenArea) {
                    chosenArea = area;
                    chosen = collision;
                }
            }

            const nestedField = pointerCollisions.find(
                (collision) =>
                    !String(collision.id).startsWith(GROUP_DROP_PREFIX),
            );

            // Child field under pointer → reorder among siblings; else nest into body.
            return nestedField ? [nestedField] : [chosen];
        }

        return pointerCollisions;
    }

    const otherDroppables = args.droppableContainers.filter(
        (container) => container.id !== args.active?.id,
    );

    if (otherDroppables.length === 0) {
        return [];
    }

    return closestCenter({
        ...args,
        droppableContainers: otherDroppables,
    });
};

type DropIntent = 'before' | 'after';
type DropLayoutIntent = 'below-new-row' | 'beside' | 'into-group' | null;

type CollectionFieldsListProps = {
    collectionId: number;
    fields: CollectionFieldRow[];
    reorderEnabled: boolean;
    onEdit: (field: CollectionFieldRow) => void;
};

type FieldRowProps = {
    field: CollectionFieldRow;
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    isGhost?: boolean;
    isDragging?: boolean;
    /** Stretch to parent height (half-width grid rows). Off in tree layout. */
    fillHeight?: boolean;
};


function rowBreakFieldIdsFromFields(fields: CollectionFieldRow[]): Set<number> {
    return new Set(
        fields
            .filter((field) => fieldStartsNewLayoutRow(field.settings))
            .map((field) => field.id),
    );
}

function fieldsWithRowBreakOverrides(
    fields: CollectionFieldRow[],
    rowBreakFieldIds: Set<number>,
): CollectionFieldRow[] {
    return fields.map((field) => {
        if (!rowBreakFieldIds.has(field.id)) {
            return field;
        }

        return {
            ...field,
            settings: {
                ...field.settings,
                layout_starts_new_row: true,
            },
        };
    });
}

function halfFieldHasOpenPartnerSlot(
    fields: CollectionFieldRow[],
    colSpans: (1 | 2)[],
    fieldIndex: number,
): boolean {
    const layoutWidth = getFieldLayoutWidth(fields[fieldIndex]?.settings);

    if (layoutWidth !== 'half' || (colSpans[fieldIndex] ?? 2) !== 1) {
        return false;
    }

    const nextField = fields[fieldIndex + 1];

    if (nextField === undefined) {
        return true;
    }

    if (fieldStartsNewLayoutRow(nextField.settings)) {
        return true;
    }

    return getFieldLayoutWidth(nextField.settings) !== 'half';
}

function computeFieldDropIntent(
    event: DragOverEvent,
    orderedFields: CollectionFieldRow[],
    colSpans: (1 | 2)[],
): {
    overFieldId: number;
    intent: DropIntent;
    layoutIntent: DropLayoutIntent;
} | null {
    const { over, active } = event;

    if (over === null || active.id === over.id) {
        return null;
    }

    const overFieldId = Number(over.id);
    const overIndex = orderedFields.findIndex(
        (field) => field.id === overFieldId,
    );

    if (overIndex === -1) {
        return null;
    }

    const overField = orderedFields[overIndex];
    const overLayoutWidth = getFieldLayoutWidth(overField.settings);
    const activeField = orderedFields.find(
        (field) => field.id === Number(active.id),
    );
    const activeLayoutWidth = activeField
        ? getFieldLayoutWidth(activeField.settings)
        : 'full';

    const overElement = document.querySelector(
        `[data-sortable-id="${String(overFieldId)}"]`,
    );
    const translatedRect = active.rect.current.translated;

    if (!(overElement instanceof HTMLElement) || translatedRect === null) {
        return { overFieldId, intent: 'after', layoutIntent: null };
    }

    const overRect = overElement.getBoundingClientRect();
    const pointerY = translatedRect.top + translatedRect.height / 2;
    const pointerX = translatedRect.left + translatedRect.width / 2;
    const relativeY = (pointerY - overRect.top) / overRect.height;
    const relativeX = (pointerX - overRect.left) / overRect.width;
    const pointerIntent: DropIntent = relativeY < 0.5 ? 'before' : 'after';

    const isVerticalDropIntent = relativeX > 0.2 && relativeX < 0.8;

    const activeCenterY = translatedRect.top + translatedRect.height / 2;
    const activeCenterX = translatedRect.left + translatedRect.width / 2;
    const draggingHorizontallyBeside =
        overLayoutWidth === 'half' &&
        activeLayoutWidth === 'half' &&
        activeCenterX > overRect.left + overRect.width * 0.55 &&
        Math.abs(activeCenterY - (overRect.top + overRect.height / 2)) <
            overRect.height * 0.35;

    if (
        overLayoutWidth === 'half' &&
        activeLayoutWidth === 'half' &&
        relativeY > 0.55 &&
        isVerticalDropIntent &&
        !draggingHorizontallyBeside
    ) {
        return {
            overFieldId,
            intent: 'after',
            layoutIntent: 'below-new-row',
        };
    }

    if (
        overLayoutWidth === 'half' &&
        activeLayoutWidth === 'half' &&
        relativeX > 0.55 &&
        halfFieldHasOpenPartnerSlot(orderedFields, colSpans, overIndex) &&
        draggingHorizontallyBeside
    ) {
        return {
            overFieldId,
            intent: 'after',
            layoutIntent: 'beside',
        };
    }

    return {
        overFieldId,
        intent: pointerIntent,
        layoutIntent: null,
    };
}

function CollectionFieldRowActions({
    field,
    collectionId,
    onEdit,
    allFields,
}: {
    field: CollectionFieldRow;
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
}) {
    const { t } = useTranslation();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);
    const isGroup = isLayoutGroupType(field.type);
    const isPanel = isPanelContainerType(field.type);

    const duplicateField = (): void => {
        router.post(
            FieldController.duplicate.url({
                collection: collectionId,
                field: field.id,
            }),
            {},
            { preserveScroll: true },
        );
    };

    const toggleFormVisibility = (): void => {
        router.post(
            FieldController.toggleFormVisibility.url({
                collection: collectionId,
                field: field.id,
            }),
            {},
            { preserveScroll: true },
        );
    };

    const updateLayoutWidth = (nextLayoutWidth: FieldLayoutWidth): void => {
        router.post(
            FieldController.updateLayoutWidth.url({
                collection: collectionId,
                field: field.id,
            }),
            { layout_width: nextLayoutWidth },
            { preserveScroll: true },
        );
    };

    const deleteField = (): void => {
        setDeleting(true);
        router.delete(
            FieldController.destroy.url({
                collection: collectionId,
                field: field.id,
            }),
            {
                preserveScroll: true,
                onFinish: () => setDeleting(false),
                onSuccess: () => setDeleteOpen(false),
                onError: () => {
                    toast.error('Could not delete field.');
                    setDeleteOpen(false);
                },
            },
        );
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label="Field actions"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                    onClick={(event) => {
                        event.stopPropagation();
                        onEdit(field);
                    }}
                >
                    <Pencil className="size-4" />
                    Modifica Campo
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={(event) => {
                        event.stopPropagation();
                        duplicateField();
                    }}
                >
                    <Copy className="size-4" />
                    Duplica Campo
                </DropdownMenuItem>
                {isPanel ? (
                    <DropdownMenuItem
                        onClick={(event) => {
                            event.stopPropagation();
                            createPanelSectionField(
                                collectionId,
                                field,
                                allFields,
                            );
                        }}
                    >
                        <Plus className="size-4" />
                        {field.type === 'group_tabs'
                            ? t('collections.groups.addTab')
                            : t('collections.groups.addSection')}
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                    onClick={(event) => {
                        event.stopPropagation();
                        toggleFormVisibility();
                    }}
                >
                    {hiddenInForm ? (
                        <Eye className="size-4" />
                    ) : (
                        <EyeOff className="size-4" />
                    )}
                    {hiddenInForm
                        ? 'Mostra campo nel dettaglio'
                        : 'Nascondi campo nel dettaglio'}
                </DropdownMenuItem>
                {!isGroup && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={(event) => {
                                event.stopPropagation();
                                updateLayoutWidth('half');
                            }}
                        >
                            <Columns2 className="size-4" />
                            Metà larghezza
                            {layoutWidth === 'half' && (
                                <Check className="ml-auto size-4" />
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={(event) => {
                                event.stopPropagation();
                                updateLayoutWidth('full');
                            }}
                        >
                            <Maximize2 className="size-4" />
                            Larghezza massima
                            {layoutWidth === 'full' && (
                                <Check className="ml-auto size-4" />
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={(event) => {
                                event.stopPropagation();
                                updateLayoutWidth('fill');
                            }}
                        >
                            <StretchHorizontal className="size-4" />
                            Riempi larghezza
                            {layoutWidth === 'fill' && (
                                <Check className="ml-auto size-4" />
                            )}
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    onClick={(event) => {
                        event.stopPropagation();
                        setDeleteOpen(true);
                    }}
                >
                    <Trash2 className="size-4" />
                    Elimina campo
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

            <ConfirmDestructiveDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete field?"
                description={`Delete "${field.name}"? This cannot be undone.`}
                confirming={deleting}
                onConfirm={deleteField}
            />
        </>
    );
}

function CollectionFieldRow({
    field,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
    isGhost = false,
    isDragging = false,
    fillHeight = true,
}: FieldRowProps) {
    const { t } = useTranslation();
    const Icon = FIELD_TYPE_ICONS[field.type] ?? Type;
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);
    const isGroup = isLayoutGroupType(field.type);

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                fillHeight && 'h-full',
                isGroup ? 'border-transparent bg-transparent' : 'bg-card',
                isGhost
                    ? 'cursor-grabbing border-primary/40 bg-card shadow-lg ring-2 ring-primary/20'
                    : !isGroup &&
                          'border-sidebar-border/70 dark:border-sidebar-border',
                isDragging && !isGhost && 'opacity-30',
                hiddenInForm && !isGhost && 'opacity-80',
            )}
        >

            <div
                className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                    reorderEnabled
                        ? 'pointer-events-none text-muted-foreground'
                        : 'opacity-40',
                )}
                aria-hidden
            >
                <GripVertical className="size-4" />
            </div>

            <div
                role="button"
                tabIndex={isGhost ? -1 : 0}
                onClick={(event) => {
                    if (isGhost) {
                        return;
                    }

                    event.stopPropagation();
                    onEdit(field);
                }}
                onKeyDown={(event) => {
                    if (isGhost) {
                        return;
                    }

                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onEdit(field);
                    }
                }}
                className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left',
                    !isGhost && 'cursor-pointer hover:bg-muted/50',
                )}
            >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                    <Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                        {getFieldDisplayName(field.settings, field.name)}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                        {fieldTypeLabel(field.type)}
                        {field.translatable
                            ? t('collections.translatableSuffix')
                            : ''}
                        {isFieldRequired(field.settings)
                            ? t('collections.requiredSuffix')
                            : ''}
                        {hiddenInForm
                            ? t('collections.hiddenInFormSuffix')
                            : ''}
                        {layoutWidth !== 'full'
                            ? ` · ${fieldLayoutWidthLabel(layoutWidth)}`
                            : ''}
                    </p>
                </div>
            </div>

            {!isGhost && (
                <CollectionFieldRowActions
                    field={field}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    allFields={allFields}
                />
            )}
        </div>
    );
}

type SortableFieldRowProps = {
    field: CollectionFieldRow;
    collectionId: number;
    colSpan: 1 | 2;
    dropIntent: DropIntent | null;
    dropLayoutIntent: DropLayoutIntent;
    isDropTarget: boolean;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    /** Tree layout: no h-full, no sortable transforms (DragOverlay only). */
    treeLayout?: boolean;
};

function SortableCollectionFieldRow({
    field,
    collectionId,
    colSpan,
    dropIntent,
    dropLayoutIntent,
    isDropTarget,
    onEdit,
    allFields,
    reorderEnabled,
    treeLayout = false,
}: SortableFieldRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: field.id,
        disabled: !reorderEnabled,
        animateLayoutChanges: treeLayout ? () => false : undefined,
    });

    // ponytail: tree DOM + flat-list transforms = overlaps/voids; overlay carries the ghost.
    const style = treeLayout
        ? undefined
        : {
              transform: CSS.Transform.toString(transform),
              transition,
          };

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-sortable-id={field.id}
            data-field-name={field.name}
            data-field-type={field.type}
            data-layout-width={getFieldLayoutWidth(field.settings)}
            {...attributes}
            {...listeners}
            aria-label={reorderEnabled ? 'Drag to reorder' : undefined}
            className={cn(
                'relative min-w-0 touch-none',
                !treeLayout && 'h-full',
                reorderEnabled && 'cursor-grab active:cursor-grabbing',
                colSpan === 2 ? 'col-span-1 md:col-span-2' : 'col-span-1',
            )}
        >
            {isDropTarget && dropLayoutIntent === 'below-new-row' && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 -bottom-1.5 z-10 h-1 rounded-full bg-primary shadow-[0_0_0_2px] shadow-primary/20"
                />
            )}
            {isDropTarget && dropLayoutIntent === 'beside' && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-2 -right-1.5 z-10 w-1 rounded-full bg-primary shadow-[0_0_0_2px] shadow-primary/20"
                />
            )}
            {isDropTarget &&
                dropLayoutIntent !== 'into-group' &&
                (dropIntent === 'before' || dropIntent === 'after') && (
                    <div
                        aria-hidden
                        className={cn(
                            'pointer-events-none absolute inset-x-1 z-10 h-1 rounded-full bg-primary shadow-[0_0_0_2px] shadow-primary/20',
                            dropIntent === 'before'
                                ? '-top-1.5'
                                : '-bottom-1.5',
                        )}
                    />
                )}
            <CollectionFieldRow
                field={field}
                collectionId={collectionId}
                onEdit={onEdit}
                allFields={allFields}
                reorderEnabled={reorderEnabled}
                isDragging={isDragging}
                fillHeight={!treeLayout}
            />
        </div>
    );
}

type GroupNestDropZoneProps = {
    groupFieldId: number;
    groupName: string;
    active: boolean;
    empty: boolean;
    header: ReactNode;
    children: ReactNode;
};

/**
 * Directus-style group: header + nested body droppable.
 * Only the body is nest-into; header stays a sibling sortable.
 */
function GroupNestDropZone({
    groupFieldId,
    groupName,
    active,
    empty,
    header,
    children,
}: GroupNestDropZoneProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: groupDropId(groupFieldId),
    });

    return (
        <div
            data-group-container={groupName}
            className={cn(
                groupSurfaceClass,
                (active || isOver) &&
                    'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
            )}
        >
            {header}
            <div
                ref={setNodeRef}
                data-group-drop={groupFieldId}
                className={cn(
                    'rounded-md',
                    empty ? 'min-h-10 px-1 py-1' : 'space-y-2 px-1 py-1',
                )}
            >
                {children}
            </div>
        </div>
    );
}

function PanelAddSectionControl({
    parent,
    collectionId,
    allFields,
    empty,
}: {
    parent: CollectionFieldRow;
    collectionId: number;
    allFields: CollectionFieldRow[];
    empty: boolean;
}) {
    const { t } = useTranslation();
    const isTabs = parent.type === 'group_tabs';
    const isPanel = isPanelContainerType(parent.type);
    const label = isTabs
        ? t('collections.groups.addTab')
        : t('collections.groups.addSection');

    if (!isPanel) {
        return empty ? (
            <p className="px-2 py-2 text-center text-sm text-muted-foreground">
                {t('collections.groups.dropIntoSection')}
            </p>
        ) : null;
    }

    return (
        <div
            className={cn(
                'flex flex-col items-center gap-2 px-2',
                empty ? 'py-3' : 'pt-1 pb-1',
            )}
        >
            {empty ? (
                <p className="text-center text-sm text-muted-foreground">
                    {isTabs
                        ? t('collections.groups.emptyTabsHint')
                        : t('collections.groups.emptyPanelHint')}
                </p>
            ) : null}
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={(event) => {
                    event.stopPropagation();
                    createPanelSectionField(collectionId, parent, allFields);
                }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <Plus className="size-4" />
                {label}
            </Button>
        </div>
    );
}

const groupSurfaceClass =
    'space-y-2 rounded-lg border bg-muted/30 p-3 dark:border-sidebar-border';

/**
 * Pack sibling tree nodes into half/full layout rows (same rules as flat mode).
 * Layout groups always span a full row so nest containers stay full width.
 */
function groupTreeNodesIntoLayoutRows(
    nodes: FieldTreeNode<CollectionFieldRow>[],
): { node: FieldTreeNode<CollectionFieldRow>; colSpan: 1 | 2 }[][] {
    const fieldsForLayout = nodes.map((node) => {
        if (!isLayoutGroupType(node.field.type)) {
            return node.field;
        }

        return {
            ...node.field,
            settings: {
                ...node.field.settings,
                layout_width: 'full',
            },
        };
    });

    const byId = new Map(nodes.map((node) => [node.field.id, node]));

    return groupFieldsIntoLayoutRows(fieldsForLayout).map((row) =>
        row.flatMap(({ field, colSpan }) => {
            const node = byId.get(field.id);

            return node ? [{ node, colSpan }] : [];
        }),
    );
}

type FieldTreeRenderProps = {
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
    allFields: CollectionFieldRow[];
    reorderEnabled: boolean;
    dropTargetFieldId?: number | null;
    dropIntent?: DropIntent | null;
    dropLayoutIntent?: DropLayoutIntent;
};

function StaticFieldTreeNodes({
    nodes,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
}: {
    nodes: FieldTreeNode<CollectionFieldRow>[];
} & Omit<
    FieldTreeRenderProps,
    'dropTargetFieldId' | 'dropIntent' | 'dropLayoutIntent'
>) {
    const layoutRows = groupTreeNodesIntoLayoutRows(nodes);

    return (
        <div className="flex flex-col gap-3">
            {layoutRows.map((row) => (
                <div
                    key={row.map((item) => item.node.field.id).join('-')}
                    className="grid grid-cols-1 gap-3 md:grid-cols-2"
                >
                    {row.map(({ node, colSpan }) => {
                        if (isLayoutGroupType(node.field.type)) {
                            return (
                                <div
                                    key={node.field.id}
                                    data-group-container={node.field.name}
                                    className={cn(
                                        groupSurfaceClass,
                                        'min-w-0 col-span-1 md:col-span-2',
                                    )}
                                >
                                    <CollectionFieldRow
                                        field={node.field}
                                        collectionId={collectionId}
                                        onEdit={onEdit}
                                        allFields={allFields}
                                        reorderEnabled={reorderEnabled}
                                        fillHeight={false}
                                    />
                                    <div className="px-1 py-1">
                                        {node.children.length > 0 ? (
                                            <StaticFieldTreeNodes
                                                nodes={node.children}
                                                collectionId={collectionId}
                                                onEdit={onEdit}
                                                allFields={allFields}
                                                reorderEnabled={reorderEnabled}
                                            />
                                        ) : null}
                                        <PanelAddSectionControl
                                            parent={node.field}
                                            collectionId={collectionId}
                                            allFields={allFields}
                                            empty={node.children.length === 0}
                                        />
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={node.field.id}
                                className={cn(
                                    'min-w-0',
                                    colSpan === 2
                                        ? 'col-span-1 md:col-span-2'
                                        : 'col-span-1',
                                )}
                            >
                                <CollectionFieldRow
                                    field={node.field}
                                    collectionId={collectionId}
                                    onEdit={onEdit}
                                    allFields={allFields}
                                    reorderEnabled={reorderEnabled}
                                    fillHeight={false}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function SortableFieldTreeNodes({
    nodes,
    collectionId,
    onEdit,
    allFields,
    dropTargetFieldId,
    dropIntent,
    dropLayoutIntent,
}: {
    nodes: FieldTreeNode<CollectionFieldRow>[];
} & FieldTreeRenderProps) {
    const siblingIds = nodes.map((node) => node.field.id);
    const layoutRows = groupTreeNodesIntoLayoutRows(nodes);

    return (
        <SortableContext
            items={siblingIds}
            strategy={verticalListSortingStrategy}
        >
            <div className="flex flex-col gap-3">
                {layoutRows.map((row) => (
                    <div
                        key={row.map((item) => item.node.field.id).join('-')}
                        className="grid grid-cols-1 gap-3 md:grid-cols-2"
                    >
                        {row.map(({ node, colSpan }) => {
                            const isIntoTarget =
                                dropTargetFieldId === node.field.id &&
                                dropLayoutIntent === 'into-group';

                            const header = (
                                <SortableCollectionFieldRow
                                    field={node.field}
                                    colSpan={
                                        isLayoutGroupType(node.field.type)
                                            ? 2
                                            : colSpan
                                    }
                                    dropIntent={
                                        dropTargetFieldId === node.field.id &&
                                        dropLayoutIntent !== 'into-group'
                                            ? (dropIntent ?? null)
                                            : null
                                    }
                                    dropLayoutIntent={
                                        dropTargetFieldId === node.field.id &&
                                        dropLayoutIntent !== 'into-group'
                                            ? (dropLayoutIntent ?? null)
                                            : null
                                    }
                                    isDropTarget={
                                        dropTargetFieldId === node.field.id &&
                                        dropLayoutIntent !== 'into-group'
                                    }
                                    collectionId={collectionId}
                                    onEdit={onEdit}
                                    allFields={allFields}
                                    reorderEnabled
                                    treeLayout
                                />
                            );

                            if (isLayoutGroupType(node.field.type)) {
                                return (
                                    <div
                                        key={node.field.id}
                                        className="min-w-0 col-span-1 md:col-span-2"
                                    >
                                        <GroupNestDropZone
                                            groupFieldId={node.field.id}
                                            groupName={node.field.name}
                                            active={isIntoTarget}
                                            empty={node.children.length === 0}
                                            header={header}
                                        >
                                            {node.children.length > 0 ? (
                                                <SortableFieldTreeNodes
                                                    nodes={node.children}
                                                    collectionId={collectionId}
                                                    onEdit={onEdit}
                                                    allFields={allFields}
                                                    reorderEnabled
                                                    dropTargetFieldId={
                                                        dropTargetFieldId
                                                    }
                                                    dropIntent={dropIntent}
                                                    dropLayoutIntent={
                                                        dropLayoutIntent
                                                    }
                                                />
                                            ) : null}
                                            <PanelAddSectionControl
                                                parent={node.field}
                                                collectionId={collectionId}
                                                allFields={allFields}
                                                empty={
                                                    node.children.length === 0
                                                }
                                            />
                                        </GroupNestDropZone>
                                    </div>
                                );
                            }

                            return (
                                <SortableCollectionFieldRow
                                    key={node.field.id}
                                    field={node.field}
                                    colSpan={colSpan}
                                    dropIntent={
                                        dropTargetFieldId === node.field.id &&
                                        dropLayoutIntent !== 'into-group'
                                            ? (dropIntent ?? null)
                                            : null
                                    }
                                    dropLayoutIntent={
                                        dropTargetFieldId === node.field.id &&
                                        dropLayoutIntent !== 'into-group'
                                            ? (dropLayoutIntent ?? null)
                                            : null
                                    }
                                    isDropTarget={
                                        dropTargetFieldId === node.field.id &&
                                        dropLayoutIntent !== 'into-group'
                                    }
                                    collectionId={collectionId}
                                    onEdit={onEdit}
                                    allFields={allFields}
                                    reorderEnabled
                                    treeLayout
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </SortableContext>
    );
}

function StaticFieldsList({
    collectionId,
    fields,
    reorderEnabled,
    onEdit,
}: CollectionFieldsListProps) {
    const hasGroups = useMemo(() => {
        return fields.some(
            (field) =>
                isLayoutGroupType(field.type) || getFieldGroupName(field) !== null,
        );
    }, [fields]);

    const fieldTree = useMemo(() => {
        if (!hasGroups) {
            return null;
        }

        return buildFieldTree(fields);
    }, [fields, hasGroups]);

    const layoutRows = useMemo(() => {
        if (hasGroups) {
            return null;
        }

        return groupFieldsIntoLayoutRows(fields);
    }, [fields, hasGroups]);

    if (hasGroups && fieldTree) {
        return (
            <StaticFieldTreeNodes
                nodes={fieldTree}
                collectionId={collectionId}
                onEdit={onEdit}
                allFields={fields}
                reorderEnabled={reorderEnabled}
            />
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {layoutRows?.map((row) => (
                <div
                    key={row.map((item) => item.field.id).join('-')}
                    className="grid grid-cols-1 gap-3 md:grid-cols-2"
                >
                    {row.map(({ field, colSpan }) => (
                        <div
                            key={field.id}
                            className={cn(
                                'min-w-0',
                                colSpan === 2
                                    ? 'col-span-1 md:col-span-2'
                                    : 'col-span-1',
                            )}
                        >
                            <CollectionFieldRow
                                field={field}
                                collectionId={collectionId}
                                onEdit={onEdit}
                                allFields={fields}
                                reorderEnabled={reorderEnabled}
                            />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function SortableFieldsList({
    collectionId,
    fields,
    onEdit,
}: Omit<CollectionFieldsListProps, 'reorderEnabled'>) {
    const [orderedFields, setOrderedFields] =
        useState<CollectionFieldRow[]>(fields);
    const [activeFieldId, setActiveFieldId] = useState<number | null>(null);
    const [ghostWidth, setGhostWidth] = useState<number | undefined>();
    const [dropTargetFieldId, setDropTargetFieldId] = useState<number | null>(
        null,
    );
    const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
    const [dropLayoutIntent, setDropLayoutIntent] =
        useState<DropLayoutIntent>(null);
    const [rowBreakFieldIds, setRowBreakFieldIds] = useState<Set<number>>(() =>
        rowBreakFieldIdsFromFields(fields),
    );
    const [fieldGroups, setFieldGroups] = useState<Map<number, string | null>>(
        () => {
            const map = new Map<number, string | null>();
            for (const field of fields) {
                const groupName = getFieldGroupName(field);
                map.set(field.id, groupName);
            }
            return map;
        },
    );
    const rowBreakFieldIdsRef = useRef(rowBreakFieldIds);
    const fieldGroupsRef = useRef(fieldGroups);
    const orderAtDragStartRef = useRef<number[]>([]);
    const rowBreakAtDragStartRef = useRef<number[]>([]);
    const groupsAtDragStartRef = useRef<Map<number, string | null>>(new Map());
    /** Pending parent for the active field; applied on drop to avoid mid-drag layout thrash. */
    const pendingActiveGroupRef = useRef<string | null | undefined>(undefined);
    const pendingBeforeSiblingRef = useRef<number | null>(null);
    const dropIntentRef = useRef<DropIntent | null>(null);
    const activeFieldIdRef = useRef<number | null>(null);

    useEffect(() => {
        const nextRowBreakFieldIds = rowBreakFieldIdsFromFields(fields);
        rowBreakFieldIdsRef.current = nextRowBreakFieldIds;
        setRowBreakFieldIds(nextRowBreakFieldIds);

        const nextFieldGroups = new Map<number, string | null>();
        for (const field of fields) {
            const groupName = getFieldGroupName(field);
            nextFieldGroups.set(field.id, groupName);
        }
        fieldGroupsRef.current = nextFieldGroups;
        setFieldGroups(nextFieldGroups);
    }, [fields]);

    const hasGroups = useMemo(() => {
        const fieldsWithOverrides = fieldsWithGroupOverrides(
            orderedFields,
            fieldGroups,
        );
        return fieldsWithOverrides.some(
            (field) =>
                isLayoutGroupType(field.type) || getFieldGroupName(field) !== null,
        );
    }, [orderedFields, fieldGroups]);

    const fieldTree = useMemo(() => {
        if (!hasGroups) {
            return null;
        }

        const fieldsWithOverrides = fieldsWithGroupOverrides(
            orderedFields,
            fieldGroups,
        );

        return buildFieldTree(fieldsWithOverrides);
    }, [orderedFields, fieldGroups, hasGroups]);

    const fieldsForLayout = useMemo(
        () => fieldsWithRowBreakOverrides(orderedFields, rowBreakFieldIds),
        [orderedFields, rowBreakFieldIds],
    );

    const colSpans = useMemo(
        () => getFieldGridColSpans(fieldsForLayout),
        [fieldsForLayout],
    );

    const layoutRows = useMemo(() => {
        if (hasGroups) {
            return null;
        }

        return groupFieldsIntoLayoutRows(fieldsForLayout);
    }, [fieldsForLayout, hasGroups]);

    useEffect(() => {
        setOrderedFields(fields);
    }, [fields]);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const activeField =
        activeFieldId === null
            ? null
            : (orderedFields.find((field) => field.id === activeFieldId) ??
              null);

    const handleDragStart = (event: DragStartEvent): void => {
        const id = Number(event.active.id);
        flushSync(() => {
            setActiveFieldId(id);
        });
        activeFieldIdRef.current = id;
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;
        dropIntentRef.current = null;
        orderAtDragStartRef.current = orderedFields.map((field) => field.id);
        rowBreakAtDragStartRef.current = Array.from(
            rowBreakFieldIdsRef.current,
        );
        groupsAtDragStartRef.current = new Map(fieldGroupsRef.current);

        const draggedElement = document.querySelector(
            `[data-sortable-id="${String(event.active.id)}"]`,
        );

        if (draggedElement instanceof HTMLElement) {
            setGhostWidth(draggedElement.offsetWidth);
        }
    };

    /** Highlight nest target only — membership commits on drop. */
    const previewNestIntoGroup = (
        activeFieldRow: CollectionFieldRow,
        groupField: CollectionFieldRow,
    ): boolean => {
        const fieldsWithOverrides = fieldsWithGroupOverrides(
            orderedFields,
            fieldGroupsRef.current,
        );

        if (
            wouldCreateGroupCycle(
                fieldsWithOverrides,
                activeFieldRow.name,
                groupField.name,
            )
        ) {
            return false;
        }

        pendingActiveGroupRef.current = groupField.name;
        pendingBeforeSiblingRef.current = null;
        setDropTargetFieldId(groupField.id);
        setDropIntent('after');
        dropIntentRef.current = 'after';
        setDropLayoutIntent('into-group');

        return true;
    };

    const handleDragOver = (event: DragOverEvent): void => {
        const { active, over } = event;

        if (over === null) {
            setDropTargetFieldId(null);
            setDropIntent(null);
            dropIntentRef.current = null;
            setDropLayoutIntent(null);

            return;
        }

        const activeFieldIdNumber = Number(active.id);
        const activeFieldRow = orderedFields.find(
            (field) => field.id === activeFieldIdNumber,
        );

        if (!activeFieldRow) {
            return;
        }

        const nestGroupId = parseGroupDropId(over.id);

        if (nestGroupId !== null) {
            const groupField = orderedFields.find(
                (field) => field.id === nestGroupId,
            );

            if (
                groupField &&
                isLayoutGroupType(groupField.type) &&
                groupField.id !== activeFieldIdNumber
            ) {
                previewNestIntoGroup(activeFieldRow, groupField);
            }

            return;
        }

        const overFieldId = Number(over.id);
        const overField = orderedFields.find((f) => f.id === overFieldId);

        if (!overField) {
            return;
        }

        const fieldsWithOverrides = fieldsWithGroupOverrides(
            orderedFields,
            fieldGroups,
        );
        const overFieldWithOverrides = fieldsWithOverrides.find(
            (f) => f.id === overFieldId,
        );
        // Group header / field drop = sibling under that field's parent (not nest-into).
        const parentForActive = getFieldGroupName(
            overFieldWithOverrides ?? overField,
        );

        if (
            parentForActive !== null &&
            wouldCreateGroupCycle(
                fieldsWithOverrides,
                activeFieldRow.name,
                parentForActive,
            )
        ) {
            return;
        }

        pendingActiveGroupRef.current = parentForActive;


        if (!hasGroups) {
            const layoutFields = fieldsWithRowBreakOverrides(
                orderedFields,
                rowBreakFieldIds,
            );
            const layoutColSpans = getFieldGridColSpans(layoutFields);
            const intentResult = computeFieldDropIntent(
                event,
                layoutFields,
                layoutColSpans,
            );

            if (intentResult !== null) {
                setDropTargetFieldId(intentResult.overFieldId);
                setDropIntent(intentResult.intent);
                dropIntentRef.current = intentResult.intent;
                setDropLayoutIntent(intentResult.layoutIntent);

                if (intentResult.layoutIntent === 'below-new-row') {
                    setRowBreakFieldIds((currentRowBreakFieldIds) => {
                        const nextRowBreakFieldIds = new Set(
                            currentRowBreakFieldIds,
                        );
                        nextRowBreakFieldIds.add(activeFieldIdNumber);
                        rowBreakFieldIdsRef.current = nextRowBreakFieldIds;

                        return nextRowBreakFieldIds;
                    });
                }

                if (intentResult.layoutIntent === 'beside') {
                    setRowBreakFieldIds((currentRowBreakFieldIds) => {
                        const nextRowBreakFieldIds = new Set(
                            currentRowBreakFieldIds,
                        );
                        nextRowBreakFieldIds.delete(activeFieldIdNumber);
                        rowBreakFieldIdsRef.current = nextRowBreakFieldIds;

                        return nextRowBreakFieldIds;
                    });
                }
            }
        } else {
            const overElement = document.querySelector(
                `[data-sortable-id="${String(overFieldId)}"]`,
            );
            const translatedRect = active.rect.current.translated;
            let intent: DropIntent = 'after';

            if (overElement instanceof HTMLElement && translatedRect !== null) {
                const overRect = overElement.getBoundingClientRect();
                const pointerY = translatedRect.top + translatedRect.height / 2;
                const relativeY = (pointerY - overRect.top) / overRect.height;
                intent = relativeY < 0.5 ? 'before' : 'after';
            }

            setDropTargetFieldId(overFieldId);
            setDropIntent(intent);
            dropIntentRef.current = intent;
            setDropLayoutIntent(null);

            if (intent === 'before') {
                pendingBeforeSiblingRef.current = overFieldId;
            } else {
                // Insert before the next same-parent sibling after `over`, else append.
                const siblings = fieldsWithOverrides.filter(
                    (field) =>
                        getFieldGroupName(field) === parentForActive &&
                        field.id !== activeFieldIdNumber,
                );
                const overSiblingIndex = siblings.findIndex(
                    (field) => field.id === overFieldId,
                );
                const nextSibling = siblings[overSiblingIndex + 1];
                pendingBeforeSiblingRef.current = nextSibling?.id ?? null;
            }
        }

        if (active.id === over.id) {
            return;
        }

        // ponytail: tree mode commits order+nest on drop (nested contexts, no live shuffle).
        if (hasGroups) {
            return;
        }

        setOrderedFields((currentFields) => {
            const oldIndex = currentFields.findIndex(
                (field) => field.id === active.id,
            );
            const overIndex = currentFields.findIndex(
                (field) => field.id === over.id,
            );

            if (oldIndex === -1 || overIndex === -1) {
                return currentFields;
            }

            if (
                dropLayoutIntent === 'below-new-row' ||
                dropLayoutIntent === 'beside'
            ) {
                const insertAfterOverIndex = overIndex + 1;

                if (oldIndex === insertAfterOverIndex) {
                    return currentFields;
                }

                let targetIndex = insertAfterOverIndex;

                if (oldIndex < targetIndex) {
                    targetIndex -= 1;
                }

                return arrayMove(currentFields, oldIndex, targetIndex);
            }

            return arrayMove(currentFields, oldIndex, overIndex);
        });
    };

    const handleDragEnd = (event: DragEndEvent): void => {
        const activeId = activeFieldIdRef.current;
        let pendingGroup = pendingActiveGroupRef.current;
        let beforeSiblingId = pendingBeforeSiblingRef.current;
        const { over } = event;

        // Prefer the drop target at release in case the last dragOver was stale.
        if (activeId !== null && over !== null) {
            const nestGroupId = parseGroupDropId(over.id);

            if (nestGroupId !== null) {
                const groupField = orderedFields.find(
                    (field) => field.id === nestGroupId,
                );
                const activeRow = orderedFields.find(
                    (field) => field.id === activeId,
                );

                if (
                    groupField &&
                    activeRow &&
                    isLayoutGroupType(groupField.type) &&
                    !wouldCreateGroupCycle(
                        fieldsWithGroupOverrides(
                            orderedFields,
                            fieldGroupsRef.current,
                        ),
                        activeRow.name,
                        groupField.name,
                    )
                ) {
                    pendingGroup = groupField.name;
                    beforeSiblingId = null;
                }
            } else if (pendingGroup === undefined) {
                const overField = orderedFields.find(
                    (field) => field.id === Number(over.id),
                );

                if (overField) {
                    const overrides = fieldsWithGroupOverrides(
                        orderedFields,
                        fieldGroupsRef.current,
                    );
                    const overWithGroup =
                        overrides.find((field) => field.id === overField.id) ??
                        overField;
                    const nextParent = getFieldGroupName(overWithGroup);
                    const activeRow = orderedFields.find(
                        (field) => field.id === activeId,
                    );

                    if (
                        nextParent !== null &&
                        activeRow &&
                        wouldCreateGroupCycle(
                            overrides,
                            activeRow.name,
                            nextParent,
                        )
                    ) {
                        // Keep existing parent; still allow sibling reorder below.
                        pendingGroup = fieldGroupsRef.current.get(activeId) ?? null;
                    } else {
                        pendingGroup = nextParent;
                    }

                    const intent = dropIntentRef.current ?? 'after';
                    if (intent === 'before') {
                        beforeSiblingId = overField.id;
                    } else {
                        const siblings = overrides.filter(
                            (field) =>
                                getFieldGroupName(field) === pendingGroup &&
                                field.id !== activeId,
                        );
                        const overSiblingIndex = siblings.findIndex(
                            (field) => field.id === overField.id,
                        );
                        beforeSiblingId =
                            siblings[overSiblingIndex + 1]?.id ?? null;
                    }
                }
            }
        }

        setActiveFieldId(null);
        activeFieldIdRef.current = null;
        setGhostWidth(undefined);
        setDropTargetFieldId(null);
        setDropIntent(null);
        dropIntentRef.current = null;
        setDropLayoutIntent(null);
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;

        setOrderedFields((currentFields) => {
            let nextFields = currentFields;
            let nextGroups = new Map(fieldGroupsRef.current);

            if (hasGroups && activeId !== null && pendingGroup !== undefined) {
                const moved = moveFieldInGroupTree(
                    currentFields,
                    nextGroups,
                    activeId,
                    pendingGroup,
                    beforeSiblingId,
                );
                nextFields = moved.fields;
                nextGroups = moved.groups;
                fieldGroupsRef.current = nextGroups;
                setFieldGroups(nextGroups);
            } else if (
                !hasGroups &&
                activeId !== null &&
                over !== null &&
                !parseGroupDropId(over.id)
            ) {
                // Flat layout: order already live-updated in dragOver; keep as-is
                // unless drop landed without prior over shuffle.
                const overIndex = nextFields.findIndex(
                    (field) => field.id === Number(over.id),
                );
                const oldIndex = nextFields.findIndex(
                    (field) => field.id === activeId,
                );

                if (
                    oldIndex !== -1 &&
                    overIndex !== -1 &&
                    oldIndex !== overIndex
                ) {
                    nextFields = arrayMove(nextFields, oldIndex, overIndex);
                }
            }

            const currentOrderIds = nextFields.map((field) => field.id);
            const currentRowBreakIds = Array.from(
                rowBreakFieldIdsRef.current,
            ).sort((left, right) => left - right);
            const orderChanged =
                currentOrderIds.join(',') !==
                orderAtDragStartRef.current.join(',');
            const rowBreakChanged =
                currentRowBreakIds.join(',') !==
                rowBreakAtDragStartRef.current.sort((a, b) => a - b).join(',');

            const currentGroups = fieldGroupsRef.current;
            const startGroups = groupsAtDragStartRef.current;
            const groupsChanged =
                currentGroups.size !== startGroups.size ||
                Array.from(currentGroups.entries()).some(
                    ([id, group]) => startGroups.get(id) !== group,
                );

            if (orderChanged || rowBreakChanged || groupsChanged) {
                const groupsPayload: Record<number, string | null> = {};
                for (const [id, group] of currentGroups.entries()) {
                    groupsPayload[id] = group;
                }

                router.post(
                    FieldController.reorder.url(collectionId),
                    {
                        ids: currentOrderIds,
                        starts_new_row_ids: currentRowBreakIds,
                        groups: groupsPayload,
                    },
                    { preserveScroll: true },
                );
            }

            return nextFields;
        });
    };

    const handleDragCancel = (): void => {
        setActiveFieldId(null);
        activeFieldIdRef.current = null;
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;
        dropIntentRef.current = null;
        setGhostWidth(undefined);
        setDropTargetFieldId(null);
        setDropIntent(null);
        setDropLayoutIntent(null);
        setOrderedFields(fields);
        setRowBreakFieldIds(rowBreakFieldIdsFromFields(fields));
        rowBreakFieldIdsRef.current = rowBreakFieldIdsFromFields(fields);

        const resetGroups = new Map<number, string | null>();
        for (const field of fields) {
            const groupName = getFieldGroupName(field);
            resetGroups.set(field.id, groupName);
        }
        setFieldGroups(resetGroups);
        fieldGroupsRef.current = resetGroups;
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={sortableFieldsCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {hasGroups && fieldTree ? (
                <SortableFieldTreeNodes
                    nodes={fieldTree}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    allFields={orderedFields}
                    reorderEnabled
                    dropTargetFieldId={dropTargetFieldId}
                    dropIntent={dropIntent}
                    dropLayoutIntent={dropLayoutIntent}
                />
            ) : (
                <SortableContext
                    items={orderedFields.map((field) => field.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="flex flex-col gap-3">
                        {layoutRows?.map((row) => (
                            <div
                                key={row.map((item) => item.field.id).join('-')}
                                className="grid grid-cols-1 gap-3 md:grid-cols-2"
                            >
                                {row.map(({ field, colSpan }) => {
                                    const fieldIndex = orderedFields.findIndex(
                                        (orderedField) =>
                                            orderedField.id === field.id,
                                    );

                                    return (
                                        <SortableCollectionFieldRow
                                            key={field.id}
                                            field={field}
                                            colSpan={
                                                fieldIndex === -1
                                                    ? colSpan
                                                    : (colSpans[fieldIndex] ?? 2)
                                            }
                                            dropIntent={
                                                dropTargetFieldId === field.id
                                                    ? dropIntent
                                                    : null
                                            }
                                            dropLayoutIntent={
                                                dropTargetFieldId === field.id
                                                    ? dropLayoutIntent
                                                    : null
                                            }
                                            isDropTarget={
                                                dropTargetFieldId === field.id
                                            }
                                            collectionId={collectionId}
                                            onEdit={onEdit}
                                            allFields={orderedFields}
                                            reorderEnabled
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </SortableContext>
            )}

            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                {activeField !== null ? (
                    <div style={ghostWidth ? { width: ghostWidth } : undefined}>
                        <CollectionFieldRow
                            field={activeField}
                            collectionId={collectionId}
                            onEdit={onEdit}
                            allFields={orderedFields}
                            reorderEnabled
                            isGhost
                            fillHeight={false}
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

/**
 * Sortable list of fields on a collection schema.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function CollectionFieldsList(props: CollectionFieldsListProps) {
    if (props.reorderEnabled) {
        return (
            <SortableFieldsList
                collectionId={props.collectionId}
                fields={props.fields}
                onEdit={props.onEdit}
            />
        );
    }

    return <StaticFieldsList {...props} />;
}
