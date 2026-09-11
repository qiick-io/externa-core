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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Sortable from 'sortablejs';
import type { MoveEvent, SortableEvent } from 'sortablejs';
import FieldController from '@/actions/App/Http/Controllers/Collections/FieldController';
import { FIELD_TYPE_ICONS } from '@/components/collections/collection-field-form';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    halfPackingAwaitingPartnerThrough,
    intentForLayoutDrop,
    resolveHalfDropOnEnd,
    rowBreakIdsForDropFrame,
} from '@/lib/collection-field-drop';
import type { OccupiedHalfInsert } from '@/lib/collection-field-drop';
import {
    buildFieldTree,
    canNestFieldIntoGroup,
    fieldsWithGroupOverrides,
    getFieldGroupName,
    isLayoutGroupType,
    isPanelContainerType,
    wouldCreateGroupCycle,
} from '@/lib/collection-field-groups';
import type { FieldTreeNode } from '@/lib/collection-field-groups';
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

/** Field-grid gap — enough air for between-item / between-group inserts. */
const FIELD_LIST_GAP_CLASS = 'gap-5';

const groupSurfaceClass =
    'space-y-2 rounded-lg border bg-muted/30 p-3 dark:border-sidebar-border';

const SORTABLE_OPTIONS = {
    group: 'fields' as const,
    handle: '.drag-handle',
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    invertSwap: true,
    // Grid half↔half seats need a low threshold or invertSwap never fires.
    swapThreshold: 0.4,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    fallbackClass: 'sortable-fallback',
    emptyInsertThreshold: 40,
};

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
    fillHeight?: boolean;
};

function findOverflowScrollParent(start: Element | null): HTMLElement | null {
    let node: Element | null = start;

    while (node instanceof HTMLElement) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;

        if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight
        ) {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

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
        const shouldStartNewRow = rowBreakFieldIds.has(field.id);
        const currentlyStarts = fieldStartsNewLayoutRow(field.settings);

        if (shouldStartNewRow === currentlyStarts) {
            return field;
        }

        return {
            ...field,
            settings: {
                ...field.settings,
                layout_starts_new_row: shouldStartNewRow,
            },
        };
    });
}

function groupsMapFromFields(
    fields: CollectionFieldRow[],
): Map<number, string | null> {
    const map = new Map<number, string | null>();

    for (const field of fields) {
        map.set(field.id, getFieldGroupName(field));
    }

    return map;
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
 * Pack sibling tree nodes into half/full layout rows.
 * Layout groups always span a full row so nest containers stay full width.
 */
function groupTreeNodesIntoLayoutRows(
    nodes: FieldTreeNode<CollectionFieldRow>[],
    rowBreakFieldIds: Set<number> = new Set(),
): {
    node: FieldTreeNode<CollectionFieldRow>;
    colSpan: 1 | 2;
    startsNewRow: boolean;
}[] {
    const fieldsForLayout = fieldsWithRowBreakOverrides(
        nodes.map((node) => {
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
        }),
        rowBreakFieldIds,
    );

    const byId = new Map(nodes.map((node) => [node.field.id, node]));
    const flat: {
        node: FieldTreeNode<CollectionFieldRow>;
        colSpan: 1 | 2;
        startsNewRow: boolean;
    }[] = [];

    for (const row of groupFieldsIntoLayoutRows(fieldsForLayout)) {
        for (const { field, colSpan } of row) {
            const node = byId.get(field.id);

            if (node) {
                flat.push({
                    node,
                    colSpan,
                    startsNewRow: rowBreakFieldIds.has(node.field.id),
                });
            }
        }
    }

    return flat;
}

/** DFS ids + parent map from Sortable DOM (post-drop SoT). */
function readDomFieldOrder(rootList: HTMLElement): {
    ids: number[];
    groups: Map<number, string | null>;
} {
    const ids: number[] = [];
    const groups = new Map<number, string | null>();

    const walk = (list: HTMLElement, parentName: string | null): void => {
        for (const child of Array.from(list.children)) {
            if (!(child instanceof HTMLElement)) {
                continue;
            }

            const idAttr = child.dataset.sortableId;

            if (!idAttr) {
                continue;
            }

            const id = Number(idAttr);

            if (!Number.isFinite(id)) {
                continue;
            }

            ids.push(id);
            groups.set(id, parentName);

            const nested = child.querySelector(':scope > [data-field-list]');

            if (nested instanceof HTMLElement) {
                const fieldName = child.dataset.fieldName ?? null;
                walk(nested, fieldName);
            }
        }
    };

    walk(rootList, null);

    return { ids, groups };
}

/**
 * Put Sortable-moved nodes back under the pre-drag lists/order so React can
 * reconcile without removeChild NotFoundError, then setState to the new tree.
 */
function restoreFieldDomToStart(
    rootList: HTMLElement,
    orderIds: readonly number[],
    groups: Map<number, string | null>,
): void {
    const items = new Map<number, HTMLElement>();

    for (const el of rootList.querySelectorAll(':scope [data-sortable-id]')) {
        if (!(el instanceof HTMLElement)) {
            continue;
        }

        // Only capture nodes that are direct children of a field list
        // (skip nested matches that are descendants of another sortable item
        // once the parent is already captured — querySelectorAll is fine if we
        // detach leaves-first... detach all list children instead.)
    }

    for (const list of rootList.querySelectorAll('[data-field-list]')) {
        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (!(child instanceof HTMLElement) || !child.dataset.sortableId) {
                continue;
            }

            const id = Number(child.dataset.sortableId);

            if (Number.isFinite(id)) {
                items.set(id, child);
            }
        }
    }

    for (const list of rootList.querySelectorAll('[data-field-list]')) {
        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (child instanceof HTMLElement && child.dataset.sortableId) {
                child.remove();
            }
        }
    }

    const listForParent = (parentName: string | null): HTMLElement | null => {
        if (parentName === null || parentName === '') {
            return rootList;
        }

        return (
            rootList.querySelector(
                `[data-field-list][data-group-parent="${CSS.escape(parentName)}"]`,
            ) ?? null
        );
    };

    for (const id of orderIds) {
        const el = items.get(id);

        if (!el) {
            continue;
        }

        const parentName = groups.get(id) ?? null;
        const list = listForParent(parentName);

        if (list) {
            list.appendChild(el);
        }
    }
}

/** Sortable onEnd carries related + originalEvent at runtime; @types omits them. */
type SortableEndEvent = SortableEvent & {
    related?: HTMLElement | null;
    originalEvent?: Event;
};

function sortableItemFromEvent(evt: SortableEvent): HTMLElement | null {
    const item = evt.item;

    return item instanceof HTMLElement ? item : null;
}

function parentGroupFromList(list: HTMLElement): string | null {
    const raw = list.dataset.groupParent;

    if (raw === undefined || raw === '') {
        return null;
    }

    return raw;
}

function clientPointFromEvent(event: Event | undefined): {
    clientX: number;
    clientY: number;
} {
    if (!event) {
        return { clientX: 0, clientY: 0 };
    }

    if ('clientX' in event && typeof event.clientX === 'number') {
        const clientY =
            'clientY' in event && typeof event.clientY === 'number'
                ? event.clientY
                : 0;

        return { clientX: event.clientX, clientY };
    }

    if ('changedTouches' in event) {
        const touch = (event as TouchEvent).changedTouches[0];

        if (touch) {
            return { clientX: touch.clientX, clientY: touch.clientY };
        }
    }

    return { clientX: 0, clientY: 0 };
}

/** Prefer MoveEvent.related; else nearest DOM sibling under the pointer. */
function resolveDropRelated(
    activeItem: HTMLElement,
    related: HTMLElement | null,
    clientX: number,
    clientY: number,
): HTMLElement | null {
    // Prefer the card under the pointer (Sortable related often lags / wrong on grid).
    const under = document.elementFromPoint(clientX, clientY);
    const underItem = under?.closest?.(
        '[data-sortable-id]',
    ) as HTMLElement | null;

    if (
        underItem?.dataset.sortableId &&
        underItem !== activeItem &&
        !activeItem.contains(underItem)
    ) {
        return underItem;
    }

    if (related?.dataset.sortableId && related !== activeItem) {
        return related;
    }

    const prev = activeItem.previousElementSibling;
    const next = activeItem.nextElementSibling;
    const candidates = [prev, next].filter(
        (el): el is HTMLElement =>
            el instanceof HTMLElement && Boolean(el.dataset.sortableId),
    );

    if (candidates.length === 0) {
        return null;
    }

    if (candidates.length === 1) {
        return candidates[0] ?? null;
    }

    let best: HTMLElement | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = (cx - clientX) ** 2 + (cy - clientY) ** 2;

        if (dist < bestDist) {
            bestDist = dist;
            best = el;
        }
    }

    return best;
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
                !isGroup &&
                    'border-sidebar-border/70 dark:border-sidebar-border',
                hiddenInForm && 'opacity-80',
            )}
        >
            <div
                className={cn(
                    'drag-handle flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                    reorderEnabled
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'pointer-events-none opacity-40',
                )}
                aria-hidden={!reorderEnabled}
                aria-label={reorderEnabled ? 'Drag to reorder' : undefined}
            >
                <GripVertical className="size-4" />
            </div>

            <div
                role="button"
                tabIndex={0}
                onClick={(event) => {
                    event.stopPropagation();
                    onEdit(field);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onEdit(field);
                    }
                }}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-muted/50"
            >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                    <Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                        {getFieldDisplayName(field.settings, field.name)}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                        {fieldTypeLabel(field.type, t)}
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

            <CollectionFieldRowActions
                field={field}
                collectionId={collectionId}
                onEdit={onEdit}
                allFields={allFields}
            />
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

function FieldTreeNodes({
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

function FlatFieldList({
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

function StaticFieldsList({
    collectionId,
    fields,
    reorderEnabled,
    onEdit,
}: CollectionFieldsListProps) {
    const hasGroups = useMemo(() => {
        return fields.some(
            (field) =>
                isLayoutGroupType(field.type) ||
                getFieldGroupName(field) !== null,
        );
    }, [fields]);

    const fieldTree = useMemo(() => {
        if (!hasGroups) {
            return null;
        }

        return buildFieldTree(fields);
    }, [fields, hasGroups]);

    const rowBreakFieldIds = useMemo(
        () => rowBreakFieldIdsFromFields(fields),
        [fields],
    );

    if (hasGroups && fieldTree) {
        return (
            <FieldTreeNodes
                nodes={fieldTree}
                collectionId={collectionId}
                onEdit={onEdit}
                allFields={fields}
                reorderEnabled={reorderEnabled}
                rowBreakFieldIds={rowBreakFieldIds}
            />
        );
    }

    return (
        <FlatFieldList
            fields={fields}
            collectionId={collectionId}
            onEdit={onEdit}
            reorderEnabled={reorderEnabled}
            rowBreakFieldIds={rowBreakFieldIds}
        />
    );
}

function SortableFieldsList({
    collectionId,
    fields,
    onEdit,
}: Omit<CollectionFieldsListProps, 'reorderEnabled'>) {
    const rootRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const orderedFieldsRef = useRef(fields);
    const rowBreakFieldIdsRef = useRef(rowBreakFieldIdsFromFields(fields));
    const fieldGroupsRef = useRef(groupsMapFromFields(fields));
    const dragStartRef = useRef<{
        orderIds: number[];
        rowBreakIds: number[];
        groups: Map<number, string | null>;
    }>({
        orderIds: fields.map((field) => field.id),
        rowBreakIds: Array.from(rowBreakFieldIdsFromFields(fields)),
        groups: groupsMapFromFields(fields),
    });
    // Sortable onEnd omits MoveEvent.related — keep last onMove target + pointer.
    const lastMoveRef = useRef<{
        related: HTMLElement | null;
        clientX: number;
        clientY: number;
    } | null>(null);
    const pointerMoveCleanupRef = useRef<(() => void) | null>(null);
    const dragCancelledRef = useRef(false);

    const [orderedFields, setOrderedFields] =
        useState<CollectionFieldRow[]>(fields);
    const [rowBreakFieldIds, setRowBreakFieldIds] = useState<Set<number>>(() =>
        rowBreakFieldIdsFromFields(fields),
    );
    const [fieldGroups, setFieldGroups] = useState<Map<number, string | null>>(
        () => groupsMapFromFields(fields),
    );
    // Bump after onEnd destroy so Sortable remounts even when group signature is unchanged.
    const [sortableEpoch, setSortableEpoch] = useState(0);

    useLayoutEffect(() => {
        orderedFieldsRef.current = orderedFields;
        rowBreakFieldIdsRef.current = rowBreakFieldIds;
        fieldGroupsRef.current = fieldGroups;
    });

    useEffect(() => {
        if (draggingRef.current) {
            return;
        }

        const nextBreaks = rowBreakFieldIdsFromFields(fields);
        const nextGroups = groupsMapFromFields(fields);
        orderedFieldsRef.current = fields;
        rowBreakFieldIdsRef.current = nextBreaks;
        fieldGroupsRef.current = nextGroups;
        setOrderedFields(fields);
        setRowBreakFieldIds(nextBreaks);
        setFieldGroups(nextGroups);
    }, [fields]);

    const fieldsForTree = useMemo(
        () =>
            fieldsWithRowBreakOverrides(
                fieldsWithGroupOverrides(orderedFields, fieldGroups),
                rowBreakFieldIds,
            ),
        [orderedFields, fieldGroups, rowBreakFieldIds],
    );

    const hasGroups = useMemo(
        () =>
            fieldsForTree.some(
                (field) =>
                    isLayoutGroupType(field.type) ||
                    getFieldGroupName(field) !== null,
            ),
        [fieldsForTree],
    );

    const fieldTree = useMemo(() => {
        if (!hasGroups) {
            return null;
        }

        return buildFieldTree(fieldsForTree);
    }, [fieldsForTree, hasGroups]);

    // Remount Sortable when nest membership / field set changes (not row-breaks).
    const treeSignature = useMemo(
        () =>
            fieldsForTree
                .map((field) => `${field.id}:${getFieldGroupName(field) ?? ''}`)
                .join('|'),
        [fieldsForTree],
    );

    useEffect(() => {
        const root = rootRef.current;

        if (!root) {
            return;
        }

        const lists = root.querySelectorAll<HTMLElement>('[data-field-list]');
        const instances: Sortable[] = [];

        const fieldsById = (): Map<number, CollectionFieldRow> => {
            const map = new Map<number, CollectionFieldRow>();

            for (const field of orderedFieldsRef.current) {
                map.set(field.id, field);
            }

            return map;
        };

        const canMove = (
            evt: MoveEvent,
            originalEvent: Event,
        ): boolean | void => {
            const dragged = evt.dragged;
            const to = evt.to;

            if (
                !(dragged instanceof HTMLElement) ||
                !(to instanceof HTMLElement)
            ) {
                return false;
            }

            // Never nest a group into its own body / descendant list.
            if (dragged.contains(to)) {
                return false;
            }

            const parentName = parentGroupFromList(to);

            if (parentName === null) {
                // Root list — always allow; record related for half packing onEnd.
                const point = clientPointFromEvent(originalEvent);
                lastMoveRef.current = {
                    related:
                        evt.related instanceof HTMLElement ? evt.related : null,
                    clientX: point.clientX,
                    clientY: point.clientY,
                };

                return true;
            }

            const activeId = Number(dragged.dataset.sortableId);
            const byId = fieldsById();
            const active = byId.get(activeId);

            if (!active || !Number.isFinite(activeId)) {
                return false;
            }

            const parentField = orderedFieldsRef.current.find(
                (field) => field.name === parentName,
            );

            if (!parentField || !isLayoutGroupType(parentField.type)) {
                return false;
            }

            if (!canNestFieldIntoGroup(active.type, parentField.type)) {
                return false;
            }

            const overrides = fieldsWithGroupOverrides(
                orderedFieldsRef.current,
                fieldGroupsRef.current,
            );

            if (wouldCreateGroupCycle(overrides, active.name, parentName)) {
                return false;
            }

            const point = clientPointFromEvent(originalEvent);
            lastMoveRef.current = {
                related:
                    evt.related instanceof HTMLElement ? evt.related : null,
                clientX: point.clientX,
                clientY: point.clientY,
            };

            return true;
        };

        const persistFromDom = (evt: SortableEndEvent): void => {
            const finishWithoutCommit = (): void => {
                dragCancelledRef.current = false;
                draggingRef.current = false;
                lastMoveRef.current = null;

                for (const instance of instances) {
                    instance.destroy();
                }

                instances.length = 0;

                const start = dragStartRef.current;
                const rootList = root.querySelector<HTMLElement>(
                    ':scope > [data-field-list]',
                );

                // Sortable may already have inverted seats — put DOM back before React.
                if (rootList) {
                    restoreFieldDomToStart(
                        rootList,
                        start.orderIds,
                        start.groups,
                    );
                }

                const byId = fieldsById();
                const restored = start.orderIds
                    .map((id) => byId.get(id))
                    .filter(
                        (field): field is CollectionFieldRow => field != null,
                    );
                const withGroups = fieldsWithGroupOverrides(
                    restored,
                    start.groups,
                );
                const withBreaks = fieldsWithRowBreakOverrides(
                    withGroups,
                    new Set(start.rowBreakIds),
                );
                orderedFieldsRef.current = withBreaks;
                fieldGroupsRef.current = new Map(start.groups);
                rowBreakFieldIdsRef.current = new Set(start.rowBreakIds);
                setOrderedFields(withBreaks);
                setFieldGroups(new Map(start.groups));
                setRowBreakFieldIds(new Set(start.rowBreakIds));
                setSortableEpoch((epoch) => epoch + 1);
            };

            if (dragCancelledRef.current) {
                finishWithoutCommit();

                return;
            }

            const rootList = root.querySelector<HTMLElement>(
                ':scope > [data-field-list]',
            );

            if (!rootList) {
                draggingRef.current = false;
                lastMoveRef.current = null;

                return;
            }

            const { ids, groups } = readDomFieldOrder(rootList);
            const byId = fieldsById();
            const nextFields = ids
                .map((id) => byId.get(id))
                .filter((field): field is CollectionFieldRow => field != null);

            // Incomplete DOM read (during teardown) — abort.
            if (nextFields.length !== orderedFieldsRef.current.length) {
                draggingRef.current = false;
                lastMoveRef.current = null;

                return;
            }

            const activeItem = sortableItemFromEvent(evt);
            const activeId = activeItem
                ? Number(activeItem.dataset.sortableId)
                : NaN;
            const start = dragStartRef.current;
            let nextBreaks = new Set(start.rowBreakIds);

            if (Number.isFinite(activeId) && activeItem) {
                const original = evt.originalEvent as
                    MouseEvent | TouchEvent | undefined;
                const endPoint = clientPointFromEvent(original);
                const move = lastMoveRef.current;
                const clientX = endPoint.clientX || move?.clientX || 0;
                const clientY = endPoint.clientY || move?.clientY || 0;
                // Prefer live pointer; fallback ghost is pointer-events:none so
                // elementFromPoint sees what's under the cursor (often chrome).
                const under = document.elementFromPoint(clientX, clientY);
                const pointerOnBoard = Boolean(
                    under?.closest?.('[data-fields-dnd]'),
                );

                // Off-board drop: Sortable may already have inverted paired seats
                // in the DOM — never persist that mid-drag order.
                if (!pointerOnBoard) {
                    finishWithoutCommit();

                    return;
                }

                const related = resolveDropRelated(
                    activeItem,
                    (evt.related instanceof HTMLElement ? evt.related : null) ??
                        move?.related ??
                        null,
                    clientX,
                    clientY,
                );
                const overId = related?.dataset.sortableId
                    ? Number(related.dataset.sortableId)
                    : null;
                const activeField = byId.get(activeId) ?? null;
                const overField =
                    overId !== null ? (byId.get(overId) ?? null) : null;

                if (activeField && overField && related && overId !== null) {
                    const rect = related.getBoundingClientRect();
                    const relativeX =
                        rect.width > 0
                            ? (clientX - rect.left) / rect.width
                            : 0.5;
                    const relativeY =
                        rect.height > 0
                            ? (clientY - rect.top) / rect.height
                            : 0.5;
                    const verticalIntent =
                        relativeY < 0.5
                            ? ('before' as const)
                            : ('after' as const);

                    const parentName =
                        groups.get(activeId) ??
                        parentGroupFromList(
                            evt.to instanceof HTMLElement ? evt.to : rootList,
                        );
                    const siblings = nextFields.filter(
                        (field) =>
                            (groups.get(field.id) ??
                                getFieldGroupName(field)) === parentName,
                    );
                    const siblingsForPack = fieldsWithRowBreakOverrides(
                        siblings.map((field) => {
                            if (!isLayoutGroupType(field.type)) {
                                return field;
                            }

                            return {
                                ...field,
                                settings: {
                                    ...field.settings,
                                    layout_width: 'full',
                                },
                            };
                        }),
                        nextBreaks,
                    );
                    const overIndex = siblingsForPack.findIndex(
                        (field) => field.id === overId,
                    );
                    const overHasOpenPartner =
                        overIndex !== -1 &&
                        getFieldLayoutWidth(
                            siblingsForPack[overIndex]?.settings,
                        ) === 'half' &&
                        halfPackingAwaitingPartnerThrough(
                            siblingsForPack,
                            overIndex,
                            (field) => fieldStartsNewLayoutRow(field.settings),
                            (field) => getFieldLayoutWidth(field.settings),
                        );

                    let overIsLeadingInOccupiedPair: boolean | null = null;

                    if (
                        overIndex !== -1 &&
                        getFieldLayoutWidth(activeField.settings) === 'half' &&
                        getFieldLayoutWidth(overField.settings) === 'half' &&
                        !overHasOpenPartner
                    ) {
                        const awaitingBefore =
                            overIndex > 0 &&
                            halfPackingAwaitingPartnerThrough(
                                siblingsForPack,
                                overIndex - 1,
                                (field) =>
                                    fieldStartsNewLayoutRow(field.settings),
                                (field) => getFieldLayoutWidth(field.settings),
                            );
                        // Leading = opened the half row; trailing = closed it.
                        const overIsLeading = !awaitingBefore;
                        const partnerIndex = overIsLeading
                            ? overIndex + 1
                            : overIndex - 1;
                        const partner = siblingsForPack[partnerIndex];
                        const partnerIsHalf =
                            partner !== undefined &&
                            getFieldLayoutWidth(partner.settings) === 'half';

                        if (partnerIsHalf && partner.id !== activeId) {
                            overIsLeadingInOccupiedPair = overIsLeading;
                        }
                    }

                    const resolved = resolveHalfDropOnEnd({
                        activeWidth: getFieldLayoutWidth(activeField.settings),
                        overWidth: getFieldLayoutWidth(overField.settings),
                        relativeX,
                        relativeY,
                        verticalIntent,
                        overHasOpenPartner,
                        overIsLeadingInOccupiedPair,
                    });

                    const dropIntent = intentForLayoutDrop(
                        resolved.intent,
                        resolved.layoutIntent,
                    );
                    let occupiedInsert: OccupiedHalfInsert | null = null;

                    if (
                        resolved.occupiedInsertActiveAsLeading &&
                        resolved.layoutIntent === 'beside'
                    ) {
                        // Leading over: active becomes new leading (B|C, D wraps).
                        // Trailing over: pair's left stays leading (C|B, D wraps).
                        let newLeadingId = activeId;

                        if (overIsLeadingInOccupiedPair === false) {
                            const pairLeading = siblingsForPack[overIndex - 1];
                            newLeadingId =
                                pairLeading !== undefined
                                    ? pairLeading.id
                                    : overId;
                        } else if (dropIntent !== 'before') {
                            newLeadingId = overId;
                        }

                        occupiedInsert = { newLeadingId };
                    }

                    const livePairedHalves =
                        getFieldLayoutWidth(activeField.settings) === 'half' &&
                        getFieldLayoutWidth(overField.settings) === 'half' &&
                        !overHasOpenPartner &&
                        overIsLeadingInOccupiedPair === null &&
                        resolved.layoutIntent === null;

                    nextBreaks = rowBreakIdsForDropFrame(
                        start.rowBreakIds,
                        activeId,
                        overId,
                        resolved.layoutIntent,
                        dropIntent,
                        false,
                        livePairedHalves,
                        occupiedInsert,
                    );

                    // CSS-grid Sortable often won't invert/move DOM seats — apply
                    // paired swap / stack-below / beside insert in the commit list.
                    if (overId !== null) {
                        const activeIdx = nextFields.findIndex(
                            (field) => field.id === activeId,
                        );
                        const overIdx = nextFields.findIndex(
                            (field) => field.id === overId,
                        );

                        if (activeIdx !== -1 && overIdx !== -1) {
                            if (resolved.layoutIntent === 'beside') {
                                const active = nextFields[activeIdx]!;
                                const without = nextFields.filter(
                                    (field) => field.id !== activeId,
                                );
                                const overAt = without.findIndex(
                                    (field) => field.id === overId,
                                );
                                const insertAt =
                                    dropIntent === 'before'
                                        ? overAt
                                        : overAt + 1;
                                without.splice(
                                    Math.max(0, insertAt),
                                    0,
                                    active,
                                );
                                nextFields.length = 0;
                                nextFields.push(...without);
                            } else if (
                                livePairedHalves &&
                                resolved.layoutIntent === null &&
                                Math.abs(activeIdx - overIdx) === 1
                            ) {
                                const swapped = [...nextFields];
                                const tmp = swapped[activeIdx]!;
                                swapped[activeIdx] = swapped[overIdx]!;
                                swapped[overIdx] = tmp;
                                nextFields.length = 0;
                                nextFields.push(...swapped);
                            } else if (
                                resolved.layoutIntent === 'below-new-row' &&
                                getFieldLayoutWidth(activeField.settings) ===
                                    'half' &&
                                getFieldLayoutWidth(overField.settings) ===
                                    'half'
                            ) {
                                const active = nextFields[activeIdx]!;
                                const without = nextFields.filter(
                                    (field) => field.id !== activeId,
                                );
                                const insertAt =
                                    without.findIndex(
                                        (field) => field.id === overId,
                                    ) + 1;
                                without.splice(insertAt, 0, active);
                                nextFields.length = 0;
                                nextFields.push(...without);
                                nextBreaks.add(activeId);
                            }
                        }
                    }
                } else if (
                    activeField &&
                    getFieldLayoutWidth(activeField.settings) === 'half'
                ) {
                    // Dropped into empty nest / no related — keep start breaks.
                    nextBreaks = new Set(start.rowBreakIds);
                }
            }

            lastMoveRef.current = null;

            // Sortable mutated real DOM. Destroy + restore pre-drag tree so React
            // can reconcile to the new order without removeChild NotFoundError.
            for (const instance of instances) {
                instance.destroy();
            }

            instances.length = 0;
            restoreFieldDomToStart(rootList, start.orderIds, start.groups);

            const withGroups = fieldsWithGroupOverrides(nextFields, groups);
            const withBreaks = fieldsWithRowBreakOverrides(
                withGroups,
                nextBreaks,
            );

            orderedFieldsRef.current = withBreaks;
            fieldGroupsRef.current = groups;
            rowBreakFieldIdsRef.current = nextBreaks;
            setOrderedFields(withBreaks);
            setFieldGroups(groups);
            setRowBreakFieldIds(nextBreaks);
            setSortableEpoch((epoch) => epoch + 1);

            const currentOrderIds = withBreaks.map((field) => field.id);
            const currentRowBreakIds = Array.from(nextBreaks).sort(
                (left, right) => left - right,
            );
            const orderChanged =
                currentOrderIds.join(',') !== start.orderIds.join(',');
            const startRowBreakIds = [...start.rowBreakIds].sort(
                (left, right) => left - right,
            );
            const rowBreakChanged =
                currentRowBreakIds.join(',') !== startRowBreakIds.join(',');
            const groupsChanged =
                groups.size !== start.groups.size ||
                Array.from(groups.entries()).some(
                    ([id, group]) => start.groups.get(id) !== group,
                );

            draggingRef.current = false;

            if (!orderChanged && !rowBreakChanged && !groupsChanged) {
                return;
            }

            const groupsPayload: Record<number, string | null> = {};

            if (groupsChanged) {
                for (const [id, group] of groups.entries()) {
                    if (start.groups.get(id) !== group) {
                        groupsPayload[id] = group;
                    }
                }
            }

            const scrollParent = findOverflowScrollParent(root);
            const savedScrollTop = scrollParent?.scrollTop ?? 0;

            router.post(
                FieldController.reorder.url(collectionId),
                {
                    ids: currentOrderIds,
                    starts_new_row_ids: currentRowBreakIds,
                    groups: groupsPayload,
                },
                {
                    preserveScroll: true,
                    preserveState: true,
                    only: ['collection'],
                    onFinish: () => {
                        if (scrollParent) {
                            scrollParent.scrollTop = savedScrollTop;
                        }
                    },
                },
            );
        };

        lists.forEach((list) => {
            instances.push(
                Sortable.create(list, {
                    ...SORTABLE_OPTIONS,
                    draggable: '[data-sortable-id]',
                    onStart: () => {
                        draggingRef.current = true;
                        dragCancelledRef.current = false;
                        lastMoveRef.current = null;
                        dragStartRef.current = {
                            orderIds: orderedFieldsRef.current.map(
                                (field) => field.id,
                            ),
                            rowBreakIds: Array.from(
                                rowBreakFieldIdsRef.current,
                            ),
                            groups: new Map(fieldGroupsRef.current),
                        };
                        const onPointerMove = (event: PointerEvent): void => {
                            lastMoveRef.current = {
                                related: lastMoveRef.current?.related ?? null,
                                clientX: event.clientX,
                                clientY: event.clientY,
                            };
                        };
                        const onKeyDown = (event: KeyboardEvent): void => {
                            if (event.key !== 'Escape') {
                                return;
                            }

                            // Capture before Sortable / React handlers; force
                            // mouseup so onEnd runs with cancelled=true.
                            dragCancelledRef.current = true;
                            event.preventDefault();
                            event.stopPropagation();
                            document.dispatchEvent(
                                new MouseEvent('mouseup', {
                                    bubbles: true,
                                    cancelable: true,
                                    view: window,
                                    clientX: lastMoveRef.current?.clientX ?? 0,
                                    clientY: lastMoveRef.current?.clientY ?? 0,
                                }),
                            );
                        };
                        document.addEventListener('pointermove', onPointerMove);
                        document.addEventListener('keydown', onKeyDown, true);
                        pointerMoveCleanupRef.current = () => {
                            document.removeEventListener(
                                'pointermove',
                                onPointerMove,
                            );
                            document.removeEventListener(
                                'keydown',
                                onKeyDown,
                                true,
                            );
                        };
                    },
                    onMove: canMove,
                    onEnd: (evt) => {
                        pointerMoveCleanupRef.current?.();
                        pointerMoveCleanupRef.current = null;
                        persistFromDom(evt);
                    },
                }),
            );
        });

        return () => {
            for (const instance of instances) {
                instance.destroy();
            }
        };
    }, [collectionId, treeSignature, sortableEpoch]);

    return (
        <div ref={rootRef} data-fields-dnd>
            {hasGroups && fieldTree ? (
                <FieldTreeNodes
                    nodes={fieldTree}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    allFields={orderedFields}
                    reorderEnabled
                    rowBreakFieldIds={rowBreakFieldIds}
                />
            ) : (
                <FlatFieldList
                    fields={fieldsForTree}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    reorderEnabled
                    rowBreakFieldIds={rowBreakFieldIds}
                />
            )}
        </div>
    );
}

/**
 * Sortable list of fields on a collection schema.
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
