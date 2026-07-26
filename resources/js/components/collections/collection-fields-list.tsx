import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type {
    CollisionDetection,
    DragOverEvent,
    DragStartEvent,
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
    StretchHorizontal,
    Trash2,
    Type,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
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
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types';

const sortableFieldsCollisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);

    if (pointerCollisions.length > 0) {
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
type DropLayoutIntent = 'below-new-row' | 'beside' | null;

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
    reorderEnabled: boolean;
    isGhost?: boolean;
    isDragging?: boolean;
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
}: {
    field: CollectionFieldRow;
    collectionId: number;
    onEdit: (field: CollectionFieldRow) => void;
}) {
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);

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
        router.delete(
            FieldController.destroy.url({
                collection: collectionId,
                field: field.id,
            }),
            {
                preserveScroll: true,
                onError: () => toast.error('Could not delete field.'),
            },
        );
    };

    return (
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    onClick={(event) => {
                        event.stopPropagation();
                        deleteField();
                    }}
                >
                    <Trash2 className="size-4" />
                    Elimina campo
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function CollectionFieldRow({
    field,
    collectionId,
    onEdit,
    reorderEnabled,
    isGhost = false,
    isDragging = false,
}: FieldRowProps) {
    const { t } = useTranslation();
    const Icon = FIELD_TYPE_ICONS[field.type] ?? Type;
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);

    return (
        <div
            className={cn(
                'flex h-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5',
                isGhost
                    ? 'cursor-grabbing border-primary/40 shadow-lg ring-2 ring-primary/20'
                    : 'border-sidebar-border/70 dark:border-sidebar-border',
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
    reorderEnabled: boolean;
};

function SortableCollectionFieldRow({
    field,
    collectionId,
    colSpan,
    dropIntent,
    dropLayoutIntent,
    isDropTarget,
    onEdit,
    reorderEnabled,
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
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-sortable-id={field.id}
            data-field-name={field.name}
            data-layout-width={getFieldLayoutWidth(field.settings)}
            {...attributes}
            {...listeners}
            aria-label={reorderEnabled ? 'Drag to reorder' : undefined}
            className={cn(
                'relative h-full min-w-0 touch-none',
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
                reorderEnabled={reorderEnabled}
                isDragging={isDragging}
            />
        </div>
    );
}

function StaticFieldsList({
    collectionId,
    fields,
    reorderEnabled,
    onEdit,
}: CollectionFieldsListProps) {
    const layoutRows = useMemo(
        () => groupFieldsIntoLayoutRows(fields),
        [fields],
    );

    return (
        <div className="flex flex-col gap-3">
            {layoutRows.map((row) => (
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
    const rowBreakFieldIdsRef = useRef(rowBreakFieldIds);
    const orderAtDragStartRef = useRef<number[]>([]);
    const rowBreakAtDragStartRef = useRef<number[]>([]);

    useEffect(() => {
        const nextRowBreakFieldIds = rowBreakFieldIdsFromFields(fields);
        rowBreakFieldIdsRef.current = nextRowBreakFieldIds;
        setRowBreakFieldIds(nextRowBreakFieldIds);
    }, [fields]);

    const fieldsForLayout = useMemo(
        () => fieldsWithRowBreakOverrides(orderedFields, rowBreakFieldIds),
        [orderedFields, rowBreakFieldIds],
    );

    const colSpans = useMemo(
        () => getFieldGridColSpans(fieldsForLayout),
        [fieldsForLayout],
    );

    const layoutRows = useMemo(
        () => groupFieldsIntoLayoutRows(fieldsForLayout),
        [fieldsForLayout],
    );

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
        flushSync(() => {
            setActiveFieldId(Number(event.active.id));
        });
        orderAtDragStartRef.current = orderedFields.map((field) => field.id);
        rowBreakAtDragStartRef.current = Array.from(
            rowBreakFieldIdsRef.current,
        );

        const draggedElement = document.querySelector(
            `[data-sortable-id="${String(event.active.id)}"]`,
        );

        if (draggedElement instanceof HTMLElement) {
            setGhostWidth(draggedElement.offsetWidth);
        }
    };

    const handleDragOver = (event: DragOverEvent): void => {
        const { active, over } = event;

        if (over === null) {
            setDropTargetFieldId(null);
            setDropIntent(null);
            setDropLayoutIntent(null);

            return;
        }

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
            setDropLayoutIntent(intentResult.layoutIntent);
        }

        const activeFieldIdNumber = Number(active.id);

        if (intentResult?.layoutIntent === 'below-new-row') {
            setRowBreakFieldIds((currentRowBreakFieldIds) => {
                const nextRowBreakFieldIds = new Set(currentRowBreakFieldIds);
                nextRowBreakFieldIds.add(activeFieldIdNumber);
                rowBreakFieldIdsRef.current = nextRowBreakFieldIds;

                return nextRowBreakFieldIds;
            });
        }

        if (intentResult?.layoutIntent === 'beside') {
            setRowBreakFieldIds((currentRowBreakFieldIds) => {
                const nextRowBreakFieldIds = new Set(currentRowBreakFieldIds);
                nextRowBreakFieldIds.delete(activeFieldIdNumber);
                rowBreakFieldIdsRef.current = nextRowBreakFieldIds;

                return nextRowBreakFieldIds;
            });
        }

        if (active.id === over.id) {
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
                intentResult?.layoutIntent === 'below-new-row' ||
                intentResult?.layoutIntent === 'beside'
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

    const handleDragEnd = (): void => {
        setActiveFieldId(null);
        setGhostWidth(undefined);
        setDropTargetFieldId(null);
        setDropIntent(null);
        setDropLayoutIntent(null);

        setOrderedFields((currentFields) => {
            const currentOrderIds = currentFields.map((field) => field.id);
            const currentRowBreakIds = Array.from(
                rowBreakFieldIdsRef.current,
            ).sort((left, right) => left - right);
            const orderChanged =
                currentOrderIds.join(',') !==
                orderAtDragStartRef.current.join(',');
            const rowBreakChanged =
                currentRowBreakIds.join(',') !==
                rowBreakAtDragStartRef.current.sort((a, b) => a - b).join(',');

            if (orderChanged || rowBreakChanged) {
                router.post(
                    FieldController.reorder.url(collectionId),
                    {
                        ids: currentOrderIds,
                        starts_new_row_ids: currentRowBreakIds,
                    },
                    { preserveScroll: true },
                );
            }

            return currentFields;
        });
    };

    const handleDragCancel = (): void => {
        setActiveFieldId(null);
        setGhostWidth(undefined);
        setDropTargetFieldId(null);
        setDropIntent(null);
        setDropLayoutIntent(null);
        setOrderedFields(fields);
        setRowBreakFieldIds(rowBreakFieldIdsFromFields(fields));
        rowBreakFieldIdsRef.current = rowBreakFieldIdsFromFields(fields);
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
            <SortableContext
                items={orderedFields.map((field) => field.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="flex flex-col gap-3">
                    {layoutRows.map((row) => (
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
                                        reorderEnabled
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                {activeField !== null ? (
                    <div style={ghostWidth ? { width: ghostWidth } : undefined}>
                        <CollectionFieldRow
                            field={activeField}
                            collectionId={collectionId}
                            onEdit={onEdit}
                            reorderEnabled
                            isGhost
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
