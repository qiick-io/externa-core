import {
    closestCenter,
    defaultDropAnimationSideEffects,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    pointerWithin,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type {
    CollisionDetection,
    DragEndEvent,
    DragMoveEvent,
    DragOverEvent,
    DragStartEvent,
    DropAnimation,
    UniqueIdentifier,
} from '@dnd-kit/core';
import {
    arrayMove,
    defaultAnimateLayoutChanges,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import type { AnimateLayoutChanges, SortingStrategy } from '@dnd-kit/sortable';
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
import {
    Fragment,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
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
    halfOpenSlotDropIntent,
    halfPairedDropIntent,
    intentForLayoutDrop,
    openPartnerBesideFromPointer,
    shouldForceHalfRowBreakForVerticalDrop,
    targetIndexForFieldDrop,
} from '@/lib/collection-field-drop';
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
    canNestFieldIntoGroup,
    fieldsWithGroupOverrides,
    getFieldGroupName,
    isLayoutGroupType,
    isPanelContainerType,
    moveFieldInGroupTree,
    moveSameParentSiblingBlock,
    reorderTreeSiblings,
    wouldCreateGroupCycle,
} from '@/lib/collection-field-groups';
import type { FieldTreeNode } from '@/lib/collection-field-groups';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { CollectionFieldRow } from '@/types';

/** Droppable id for a group's interior nest zone (body only, not header). */
const GROUP_DROP_PREFIX = 'group-drop:';

/** Nearest overflow scroll ancestor (PageLayout scrollContent), not window. */
function findOverflowScrollParent(
    start: Element | null,
): HTMLElement | null {
    let node = start?.parentElement ?? null;

    while (node) {
        const { overflowY } = getComputedStyle(node);

        if (overflowY === 'auto' || overflowY === 'scroll') {
            return node;
        }

        node = node.parentElement;
    }

    return null;
}

/** True when both sets contain the same ids (order ignored). */
function numberSetsEqual(left: Set<number>, right: Set<number>): boolean {
    if (left.size !== right.size) {
        return false;
    }

    for (const value of left) {
        if (!right.has(value)) {
            return false;
        }
    }

    return true;
}

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

/** Live sortable box — dnd-kit over.rect lags same-parent FLIP / live moves. */
function liveSortableRect(fieldId: number): {
    top: number;
    left: number;
    width: number;
    height: number;
} | null {
    const node = document.querySelector(`[data-sortable-id="${fieldId}"]`);

    if (!(node instanceof HTMLElement)) {
        return null;
    }

    const box = node.getBoundingClientRect();

    return {
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
    };
}

/**
 * When dragging a half, prefer another half in the pointer's row band.
 * Collision often reports the full-width row above while the cursor is on a
 * half pair (overlay hole / gap) — that blocks below-new-row / beside.
 */
function halfFieldIdInPointerRow(
    pointer: { x: number; y: number },
    activeId: number,
): number | null {
    let nearestId: number | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const node of document.querySelectorAll(
        '[data-sortable-id][data-layout-width="half"]',
    )) {
        if (!(node instanceof HTMLElement)) {
            continue;
        }

        const id = Number(node.getAttribute('data-sortable-id'));

        if (!Number.isFinite(id) || id === activeId) {
            continue;
        }

        const rect = node.getBoundingClientRect();

        // Include a little below the card for stack-below aims.
        if (pointer.y < rect.top - 8 || pointer.y > rect.bottom + 28) {
            continue;
        }

        if (pointer.x >= rect.left && pointer.x <= rect.right) {
            return id;
        }

        const cx = rect.left + rect.width / 2;
        const dist = Math.abs(pointer.x - cx);

        if (dist < nearestDist) {
            nearestDist = dist;
            nearestId = id;
        }
    }

    return nearestId;
}

function fieldIsInsideGroup(
    fields: CollectionFieldRow[],
    groups: Map<number, string | null>,
    fieldId: number,
    groupName: string,
): boolean {
    const startField = fields.find((field) => field.id === fieldId);
    let parentName =
        groups.get(fieldId) ??
        (startField ? getFieldGroupName(startField) : null);

    // ponytail: walk parents; depth capped so a cycle can't hang the drag handler.
    for (let depth = 0; depth < 32 && parentName !== null; depth += 1) {
        if (parentName === groupName) {
            return true;
        }

        const parentField = fields.find((field) => field.name === parentName);

        if (!parentField) {
            return false;
        }

        parentName =
            groups.get(parentField.id) ?? getFieldGroupName(parentField);
    }

    return false;
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

/** Latest sensor pointer from collision args (survives auto-scroll; DOM moves don't). */
let latestCollisionPointer: { x: number; y: number } | null = null;

type FieldDndPointer = { x: number; y: number };

type ExternaFieldDndWindow = Window & {
    __externaFieldDndPointer?: FieldDndPointer | null;
    __externaFieldDndActiveId?: number | null;
    /** Live binding — survives Vite HMR splitting effect vs render modules. */
    __externaApplyOpenPartnerBeside?: (
        pointer: FieldDndPointer | null,
    ) => boolean;
    __externaScheduleDragOverProcess?: () => void;
};

/** Window-global so Vite HMR can't split listeners vs processDragOver bindings. */
function setWindowDragPointer(pointer: FieldDndPointer | null): void {
    (window as ExternaFieldDndWindow).__externaFieldDndPointer = pointer;
}

function getWindowDragPointer(): FieldDndPointer | null {
    return (window as ExternaFieldDndWindow).__externaFieldDndPointer ?? null;
}

/**
 * We own live reorder (row-break / applyLiveTreeMove). dnd-kit's rect strategy
 * CSS-translates siblings under the pointer and makes half↔half aim miss the card.
 */
const noDisplacementSortingStrategy: SortingStrategy = () => null;

/**
 * Topmost field / group-drop under the cursor (skips DragOverlay).
 * DOM hit-test beats pointerWithin after auto-scroll or live layout shifts —
 * stale droppable rects otherwise light the wrong neighbor (often a full row).
 */
function droppableIdUnderPointer(
    pointer: { x: number; y: number },
    activeId: string | number | undefined,
): string | number | null {
    const hits = document.elementsFromPoint(pointer.x, pointer.y);

    for (const hit of hits) {
        if (!(hit instanceof Element)) {
            continue;
        }

        if (hit.closest('[data-dnd-field-overlay]')) {
            continue;
        }

        const groupDrop = hit.closest('[data-group-drop], [id^="group-drop:"]');

        if (groupDrop instanceof HTMLElement) {
            const raw =
                groupDrop.getAttribute('data-group-drop') ??
                groupDrop.id.replace(/^group-drop:/, '');
            const groupId = Number(raw);

            if (Number.isFinite(groupId) && groupId !== Number(activeId)) {
                return `${GROUP_DROP_PREFIX}${groupId}`;
            }
        }

        const sortable = hit.closest('[data-sortable-id]');

        if (!(sortable instanceof HTMLElement)) {
            continue;
        }

        const id = Number(sortable.getAttribute('data-sortable-id'));

        if (!Number.isFinite(id) || id === Number(activeId)) {
            continue;
        }

        return id;
    }

    // Gap / overlay hole: stay on the same row band (don't jump to the full
    // field above). Prefer X containment, else nearest center-X in that band.
    type RowHit = { id: number; rect: DOMRect };
    const rowHits: RowHit[] = [];

    for (const node of document.querySelectorAll('[data-sortable-id]')) {
        if (!(node instanceof HTMLElement)) {
            continue;
        }

        const id = Number(node.getAttribute('data-sortable-id'));

        if (!Number.isFinite(id) || id === Number(activeId)) {
            continue;
        }

        const rect = node.getBoundingClientRect();

        if (
            pointer.x >= rect.left &&
            pointer.x <= rect.right &&
            pointer.y >= rect.top &&
            pointer.y <= rect.bottom
        ) {
            return id;
        }

        if (pointer.y >= rect.top - 10 && pointer.y <= rect.bottom + 10) {
            rowHits.push({ id, rect });
        }
    }

    if (rowHits.length === 0) {
        return null;
    }

    const containingX = rowHits.find(
        (hit) => pointer.x >= hit.rect.left && pointer.x <= hit.rect.right,
    );

    if (containingX) {
        return containingX.id;
    }

    let nearestId = rowHits[0].id;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const hit of rowHits) {
        const cx = hit.rect.left + hit.rect.width / 2;
        const dist = Math.abs(pointer.x - cx);

        if (dist < nearestDist) {
            nearestDist = dist;
            nearestId = hit.id;
        }
    }

    return nearestId;
}

const sortableFieldsCollisionDetection: CollisionDetection = (args) => {
    if (args.pointerCoordinates) {
        latestCollisionPointer = {
            x: args.pointerCoordinates.x,
            y: args.pointerCoordinates.y,
        };
    }

    const activeId = args.active?.id;

    if (args.pointerCoordinates) {
        const underId = droppableIdUnderPointer(
            args.pointerCoordinates,
            activeId,
        );

        if (underId !== null) {
            const container = args.droppableContainers.find(
                (entry) =>
                    entry.id === underId ||
                    entry.id === String(underId) ||
                    Number(entry.id) === Number(underId),
            );

            if (container) {
                return [{ id: container.id }];
            }
        }
    }

    const pointerCollisions = pointerWithin(args).filter(
        (collision) => collision.id !== activeId,
    );

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

        // Fallback: smallest droppable area under the pointer.
        let smallest = pointerCollisions[0];
        let smallestArea = Number.POSITIVE_INFINITY;

        for (const collision of pointerCollisions) {
            const container = args.droppableContainers.find(
                (entry) => entry.id === collision.id,
            );
            const rect = container?.rect.current;

            if (!rect) {
                continue;
            }

            const area = rect.width * rect.height;

            if (area < smallestArea) {
                smallestArea = area;
                smallest = collision;
            }
        }

        return [smallest];
    }

    const otherDroppables = args.droppableContainers.filter(
        (container) => container.id !== activeId,
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
    /**
     * Nest-into preview: hide the origin dashed ghost so only the nest-zone
     * placeholder is illuminated (Directus moves ghost into the group).
     */
    suppressGhostSlot?: boolean;
    /** Hide action menus while any field is being dragged (keeps drag at 60fps). */
    suppressActions?: boolean;
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
    // Source of truth during drag: must clear as well as set, otherwise
    // beside previews keep a stale layout_starts_new_row from field.settings.
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

function halfFieldHasOpenPartnerSlot(
    fields: CollectionFieldRow[],
    colSpans: (1 | 2)[],
    fieldIndex: number,
    /**
     * While dragging a half, ignore it in packing so its former partner shows
     * an empty column (Directus). Without this, active still "fills" the slot
     * and beside never mounts an empty partner target.
     */
    ignoreFieldId: number | null = null,
): boolean {
    if (ignoreFieldId !== null) {
        const target = fields[fieldIndex];

        if (target === undefined || target.id === ignoreFieldId) {
            return false;
        }

        const withoutActive = fields.filter(
            (field) => field.id !== ignoreFieldId,
        );
        const mappedIndex = withoutActive.findIndex(
            (field) => field.id === target.id,
        );

        if (mappedIndex === -1) {
            return false;
        }

        return halfFieldHasOpenPartnerSlot(
            withoutActive,
            getFieldGridColSpans(withoutActive),
            mappedIndex,
            null,
        );
    }

    const layoutWidth = getFieldLayoutWidth(fields[fieldIndex]?.settings);

    if (layoutWidth !== 'half' || (colSpans[fieldIndex] ?? 2) !== 1) {
        return false;
    }

    // Leading half only (opened a row). Trailing partner of a pair → false.
    let awaitingHalfPartner = false;

    for (let index = 0; index <= fieldIndex; index++) {
        const field = fields[index];

        if (field === undefined) {
            continue;
        }

        if (fieldStartsNewLayoutRow(field.settings)) {
            awaitingHalfPartner = false;
        }

        const width = getFieldLayoutWidth(field.settings);

        if (width === 'full') {
            awaitingHalfPartner = false;
            continue;
        }

        if (width === 'half') {
            awaitingHalfPartner = !awaitingHalfPartner;
            continue;
        }

        awaitingHalfPartner = false;
    }

    if (!awaitingHalfPartner) {
        return false;
    }

    const nextField = fields[fieldIndex + 1];

    if (nextField === undefined) {
        return true;
    }

    if (fieldStartsNewLayoutRow(nextField.settings)) {
        return true;
    }

    // Next half would fill this row — not an open slot.
    return getFieldLayoutWidth(nextField.settings) !== 'half';
}

/**
 * Sibling list for half/full packing + drop intents.
 * Layout groups always count as full so nest containers stay full width.
 */
function siblingFieldsForLayout(
    fields: CollectionFieldRow[],
    parentGroup: string | null,
    rowBreakFieldIds: Set<number>,
): CollectionFieldRow[] {
    const siblings = fields.filter(
        (field) => getFieldGroupName(field) === parentGroup,
    );

    return fieldsWithRowBreakOverrides(siblings, rowBreakFieldIds).map(
        (field) => {
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
        },
    );
}

function computeFieldDropIntent(
    event: DragOverEvent,
    layoutFields: CollectionFieldRow[],
    colSpans: (1 | 2)[],
    /** Active field when it is not yet in `layoutFields` (cross-parent drag). */
    activeFieldFallback?: CollectionFieldRow | null,
    /** Live pointer — SortableJS uses client coords, not overlay-center. */
    pointer?: { x: number; y: number } | null,
    /**
     * When collision hit a group-drop body we're already inside, remap to the
     * sibling field under the pointer (id + live rect).
     */
    overOverride?: {
        id: number;
        rect: {
            top: number;
            left: number;
            width: number;
            height: number;
        } | null;
    } | null,
): {
    overFieldId: number;
    intent: DropIntent;
    layoutIntent: DropLayoutIntent;
} | null {
    const { over, active } = event;

    if (over === null && overOverride == null) {
        return null;
    }

    const overFieldId = overOverride?.id ?? Number(over!.id);

    if (active.id === overFieldId) {
        return null;
    }

    const overIndex = layoutFields.findIndex(
        (field) => field.id === overFieldId,
    );

    if (overIndex === -1) {
        return null;
    }

    const overField = layoutFields[overIndex];
    const overLayoutWidth = getFieldLayoutWidth(overField.settings);
    const activeField =
        layoutFields.find((field) => field.id === Number(active.id)) ??
        activeFieldFallback ??
        null;
    const activeLayoutWidth = activeField
        ? getFieldLayoutWidth(activeField.settings)
        : 'full';
    const activeIndex = layoutFields.findIndex(
        (field) => field.id === Number(active.id),
    );
    // SortableJS invert-swap: after a live move puts the ghost above `over`,
    // the pointer sits mid-target and must not immediately flip back to after.
    const ghostAlreadyBefore =
        activeIndex !== -1 && activeIndex < overIndex;

    // ponytail: prefer dnd-kit measured rect; override path uses one live box
    // only when remapping off an own-group body hit.
    const overRect = overOverride?.rect ?? over?.rect ?? null;
    const translatedRect = active.rect.current.translated;

    if (overRect == null) {
        return { overFieldId, intent: 'after', layoutIntent: null };
    }

    // Prefer sensor / window pointer. If missing, use overlay *center* — the
    // old overlay-top fallback sat at ~0.35 of the target and blocked
    // half↔half below-new-row (needs relY > 0.45).
    const overlayCenterY = translatedRect
        ? translatedRect.top + translatedRect.height * 0.5
        : null;
    const overlayProbeY = translatedRect
        ? translatedRect.top + Math.min(12, translatedRect.height * 0.1)
        : null;
    const pointerX =
        pointer?.x ??
        (translatedRect
            ? translatedRect.left + translatedRect.width / 2
            : overRect.left + overRect.width / 2);
    let pointerY =
        pointer?.y ??
        overlayCenterY ??
        overRect.top + overRect.height / 2;

    const pointerRelativeY =
        (pointerY - overRect.top) / Math.max(overRect.height, 1);

    if (
        !ghostAlreadyBefore &&
        overlayProbeY !== null &&
        pointer != null &&
        overlayProbeY < pointerY &&
        pointerRelativeY < 0.55
    ) {
        pointerY = overlayProbeY;
    }

    const relativeX = (pointerX - overRect.left) / overRect.width;
    let relativeY = (pointerY - overRect.top) / overRect.height;

    // SortableJS invert-swap: once the ghost is above, require a deep bottom
    // band to flip back (sensor Y lags under scroll; mid-target must not undo).
    const verticalIntent = (y: number): DropIntent => {
        if (ghostAlreadyBefore) {
            return y > 0.9 ? 'after' : 'before';
        }

        return y < 0.5 ? 'before' : 'after';
    };

    // Over a full field: vertical before/after ONLY (never beside). SortableJS
    // direction is vertical unless both drag+target are half.
    if (overLayoutWidth === 'full' || overLayoutWidth === 'fill') {
        return {
            overFieldId,
            intent: verticalIntent(relativeY),
            layoutIntent: null,
        };
    }

    // Half↔half over an open partner slot: prefer the real empty-column rect
    // (Directus ghost lands in that slot). Bottom strip stacks to a new row.
    // Ignore active in packing — otherwise the dragged half still "fills" the
    // slot and beside never wins.
    if (
        overLayoutWidth === 'half' &&
        activeLayoutWidth === 'half' &&
        halfFieldHasOpenPartnerSlot(
            layoutFields,
            colSpans,
            overIndex,
            Number(active.id),
        )
    ) {
        const partnerSlot = document.querySelector(
            `[data-sortable-id="${overFieldId}"] [data-empty-partner-slot]`,
        );

        if (partnerSlot instanceof HTMLElement) {
            const partnerRect = partnerSlot.getBoundingClientRect();
            // Use the same SoT coordinates as relativeX/Y (pointer or overlay).
            const hitX = pointerX;
            const hitY = pointerY;
            const inPartnerColumn =
                hitX >= partnerRect.left - 4 &&
                hitX <= partnerRect.right + 4 &&
                hitY >= partnerRect.top - 4 &&
                hitY <= partnerRect.bottom + 4;

            if (inPartnerColumn) {
                return {
                    overFieldId,
                    intent: 'after',
                    layoutIntent: 'beside',
                };
            }
        }

        const openSlot = halfOpenSlotDropIntent(relativeX, relativeY);

        return {
            overFieldId,
            intent: openSlot.intent,
            layoutIntent: openSlot.layoutIntent,
        };
    }

    // Half↔half already paired: bottom band stacks below; otherwise vertical reorder.
    if (overLayoutWidth === 'half' && activeLayoutWidth === 'half') {
        // Overlay can sit deeper than a lagging pointer — use the lower of the
        // two so stack-below still wins when the ghost is on the bottom band.
        if (translatedRect) {
            const overlayBandY =
                (translatedRect.top +
                    translatedRect.height * 0.75 -
                    overRect.top) /
                Math.max(overRect.height, 1);
            relativeY = Math.max(relativeY, overlayBandY);
        }

        const paired = halfPairedDropIntent(
            relativeX,
            relativeY,
            verticalIntent(relativeY),
        );

        return {
            overFieldId,
            intent: paired.intent,
            layoutIntent: paired.layoutIntent,
        };
    }

    return {
        overFieldId,
        intent: verticalIntent(relativeY),
        layoutIntent: null,
    };
}

/**
 * Animate layout only around drop — not on every live slot change.
 * Continuous FLIP + 100+ useSortable rect reads was the main drag jank source;
 * DragOverlay still tracks the pointer at 60fps like Directus' ghost.
 */
const fieldAnimateLayoutChanges: AnimateLayoutChanges = (args) => {
    const { isSorting, wasDragging } = args;

    if (isSorting) {
        return false;
    }

    if (!wasDragging) {
        return false;
    }

    return defaultAnimateLayoutChanges(args);
};

const fieldsDndMeasuring = {
    droppable: {
        // Live same-parent moves shift DOM; BeforeDragging froze hit-rects so
        // collision/intent lit a different slot than the ghost placeholder.
        strategy: MeasuringStrategy.WhileDragging,
    },
};

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
    suppressGhostSlot = false,
    suppressActions = false,
    fillHeight = true,
}: FieldRowProps) {
    const { t } = useTranslation();
    const Icon = FIELD_TYPE_ICONS[field.type] ?? Type;
    const hiddenInForm = isFieldHiddenInForm(field.settings);
    const layoutWidth = getFieldLayoutWidth(field.settings);
    const isGroup = isLayoutGroupType(field.type);
    const showInListGhost = isDragging && !suppressGhostSlot;

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                fillHeight && 'h-full',
                isGroup ? 'border-transparent bg-transparent' : 'bg-card',
                isGhost
                    ? 'cursor-grabbing border-primary/40 bg-card shadow-lg ring-2 ring-primary/20'
                    : showInListGhost
                      ? // Directus .sortable-ghost: dashed slot, hide contents
                        'border-dashed border-primary bg-transparent shadow-none'
                      : isDragging && suppressGhostSlot
                        ? // Nest preview: origin stays in flow for hit-testing, unlit.
                          'border-transparent bg-transparent shadow-none opacity-0'
                        : !isGroup &&
                          'border-sidebar-border/70 dark:border-sidebar-border',
                hiddenInForm && !isGhost && !isDragging && 'opacity-80',
            )}
        >
            <div
                className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                    (showInListGhost || (isDragging && suppressGhostSlot)) &&
                        !isGhost &&
                        'opacity-0',
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
                    if (isGhost || isDragging) {
                        return;
                    }

                    event.stopPropagation();
                    onEdit(field);
                }}
                onKeyDown={(event) => {
                    if (isGhost || isDragging) {
                        return;
                    }

                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onEdit(field);
                    }
                }}
                className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left',
                    isDragging && !isGhost && 'opacity-0',
                    !isGhost && !isDragging && 'cursor-pointer hover:bg-muted/50',
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

            {!isGhost && !isDragging && !suppressActions && (
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
    /** Lone half with empty partner column — expand hit target + show slot ghost. */
    openPartnerSlot?: boolean;
    /**
     * Half dragged above/below a full: dashed ghost spans the full row so the
     * full never packs into the empty partner column during live preview.
     */
    forceFullRowPlaceholder?: boolean;
    /** True while any sortable is active — skip menus + non-FLIP CSS transitions. */
    listDragging?: boolean;
    /** Nest-into: unlit origin slot (ghost lives in the nest zone). */
    suppressGhostSlot?: boolean;
};

function SortableCollectionFieldRow({
    field,
    collectionId,
    colSpan,
    dropIntent: _dropIntent,
    dropLayoutIntent,
    isDropTarget,
    onEdit,
    allFields,
    reorderEnabled,
    treeLayout = false,
    openPartnerSlot = false,
    forceFullRowPlaceholder = false,
    listDragging = false,
    suppressGhostSlot = false,
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
        // Directus SortableJS animation: 150ms — FLIP siblings as the ghost slot moves.
        animateLayoutChanges: fieldAnimateLayoutChanges,
        transition: {
            duration: 150,
            easing: 'ease',
        },
    });

    const isFullSpan = colSpan === 2 || forceFullRowPlaceholder;
    // Full-width items never get horizontal FLIP (half beside / grid reflow).
    // Matches SortableJS vertical direction when target isn't a shareable half.
    const clampedTransform =
        transform && isFullSpan ? { ...transform, x: 0 } : transform;

    // ponytail: never display:none / collapse before DragOverlay measures — that zeros
    // activeNodeRect and the clone jumps top-left. Keep the dashed in-list ghost
    // (isDragging) so layout FLIP still has a real box to animate around.
    const style = {
        transform: CSS.Transform.toString(clampedTransform),
        transition: transition ?? 'transform 150ms ease',
    };

    const showEmptyPartnerGhost =
        openPartnerSlot &&
        isDropTarget &&
        dropLayoutIntent === 'beside' &&
        !isDragging;

    // Lone half: span the full row so the empty partner column is a real drop target
    // (pointer over empty space still hits this sortable). Card stays half-width.
    const expandsForOpenSlot = openPartnerSlot && !isFullSpan;

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-sortable-id={field.id}
            data-field-name={field.name}
            data-field-type={field.type}
            data-layout-width={getFieldLayoutWidth(field.settings)}
            data-open-partner-slot={openPartnerSlot ? '1' : undefined}
            {...attributes}
            {...listeners}
            aria-label={reorderEnabled ? 'Drag to reorder' : undefined}
            className={cn(
                'relative min-w-0 touch-none',
                // Grid-column CSS transitions fight FLIP during live reorder.
                !listDragging &&
                    'transition-[grid-column] duration-150 ease-out',
                !treeLayout && 'h-full',
                reorderEnabled && 'cursor-grab active:cursor-grabbing',
                isFullSpan || expandsForOpenSlot
                    ? 'col-span-1 md:col-span-2'
                    : 'col-span-1',
            )}
        >
            {expandsForOpenSlot ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <CollectionFieldRow
                        field={field}
                        collectionId={collectionId}
                        onEdit={onEdit}
                        allFields={allFields}
                        reorderEnabled={reorderEnabled}
                        isDragging={isDragging}
                        suppressGhostSlot={suppressGhostSlot}
                        suppressActions={listDragging}
                        fillHeight={!treeLayout}
                    />
                    <div
                        aria-hidden
                        data-empty-partner-slot
                        className={cn(
                            // Keep in layout for hit-testing / ghost; invisible when idle.
                            'min-h-[3.25rem] rounded-xl border border-transparent max-md:hidden',
                            showEmptyPartnerGhost &&
                                'border-dashed border-primary bg-transparent',
                        )}
                    />
                </div>
            ) : (
                <CollectionFieldRow
                    field={field}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    allFields={allFields}
                    reorderEnabled={reorderEnabled}
                    isDragging={isDragging}
                    suppressGhostSlot={suppressGhostSlot}
                    suppressActions={listDragging}
                    fillHeight={!treeLayout}
                />
            )}
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
 * Ring + dashed nest ghost share one SoT (`active` from into-group preview) —
 * raw `isOver` used to light a different group than the origin ghost.
 */
function GroupNestDropZone({
    groupFieldId,
    groupName,
    active,
    empty,
    header,
    children,
}: GroupNestDropZoneProps) {
    const { setNodeRef } = useDroppable({
        id: groupDropId(groupFieldId),
    });

    return (
        <div
            data-group-container={groupName}
            className={cn(
                groupSurfaceClass,
                active &&
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
                {active ? (
                    <div
                        aria-hidden
                        data-nest-drop-ghost
                        className="min-h-[3.25rem] rounded-xl border border-dashed border-primary bg-transparent"
                    />
                ) : null}
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
 * Row-break drag state must be applied here — tree nodes keep stale settings.
 */
function groupTreeNodesIntoLayoutRows(
    nodes: FieldTreeNode<CollectionFieldRow>[],
    rowBreakFieldIds: Set<number> = new Set(),
): { node: FieldTreeNode<CollectionFieldRow>; colSpan: 1 | 2 }[][] {
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
    activeFieldId?: number | null;
    listDragging?: boolean;
    rowBreakFieldIds?: Set<number>;
};

function StaticFieldTreeNodes({
    nodes,
    collectionId,
    onEdit,
    allFields,
    reorderEnabled,
    rowBreakFieldIds = new Set(),
}: {
    nodes: FieldTreeNode<CollectionFieldRow>[];
} & Omit<
    FieldTreeRenderProps,
    'dropTargetFieldId' | 'dropIntent' | 'dropLayoutIntent'
>) {
    const layoutRows = groupTreeNodesIntoLayoutRows(nodes, rowBreakFieldIds);

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
                                                rowBreakFieldIds={
                                                    rowBreakFieldIds
                                                }
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
    activeFieldId = null,
    listDragging = false,
    rowBreakFieldIds = new Set(),
}: {
    nodes: FieldTreeNode<CollectionFieldRow>[];
} & FieldTreeRenderProps) {
    const siblingIds = nodes.map((node) => node.field.id);
    const layoutRows = groupTreeNodesIntoLayoutRows(nodes, rowBreakFieldIds);
    // Flatten to one grid (Directus field-grid) so siblings FLIP around the live ghost slot.
    const flatItems = layoutRows.flatMap((row) =>
        row.map(({ node, colSpan }) => {
            const startsNewRow = rowBreakFieldIds.has(node.field.id);

            return { node, colSpan, startsNewRow };
        }),
    );

    // Apply live row-break overrides — raw field.settings still say "paired" after
    // an unpair drop, which hid empty partner slots (beside ghost never lit).
    const layoutFieldsForSlots = fieldsWithRowBreakOverrides(
        flatItems.map(({ node, colSpan }) => {
            if (!isLayoutGroupType(node.field.type) && colSpan !== 2) {
                return node.field;
            }

            // Match packing: groups / full spans never offer a half partner slot.
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
    const layoutColSpansForSlots = flatItems.map(({ colSpan }) => colSpan);
    const dropTargetField =
        dropTargetFieldId == null
            ? null
            : (flatItems.find((item) => item.node.field.id === dropTargetFieldId)
                  ?.node.field ?? null);
    const dropTargetWidth = dropTargetField
        ? getFieldLayoutWidth(dropTargetField.settings)
        : null;

    return (
        <SortableContext
            items={siblingIds}
            strategy={noDisplacementSortingStrategy}
        >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {flatItems.map(({ node, colSpan, startsNewRow }, index) => {
                    const isIntoTarget =
                        dropTargetFieldId === node.field.id &&
                        dropLayoutIntent === 'into-group';
                    const showRowBreak =
                        startsNewRow &&
                        index > 0 &&
                        dropLayoutIntent !== 'beside';
                    const openPartnerSlot =
                        !isLayoutGroupType(node.field.type) &&
                        node.field.id !== activeFieldId &&
                        halfFieldHasOpenPartnerSlot(
                            layoutFieldsForSlots,
                            layoutColSpansForSlots,
                            index,
                            activeFieldId,
                        );
                    const forceFullRowPlaceholder =
                        activeFieldId === node.field.id &&
                        dropLayoutIntent === null &&
                        getFieldLayoutWidth(node.field.settings) === 'half' &&
                        (dropTargetWidth === 'full' ||
                            dropTargetWidth === 'fill');
                    // Nest + beside: origin unlit; drop SoT is nest/partner ghost.
                    const suppressGhostSlot =
                        activeFieldId === node.field.id &&
                        (dropLayoutIntent === 'into-group' ||
                            dropLayoutIntent === 'beside');

                    const header = (
                        <SortableCollectionFieldRow
                            field={node.field}
                            colSpan={
                                isLayoutGroupType(node.field.type) ? 2 : colSpan
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
                            openPartnerSlot={openPartnerSlot}
                            forceFullRowPlaceholder={forceFullRowPlaceholder}
                            listDragging={listDragging}
                            suppressGhostSlot={suppressGhostSlot}
                        />
                    );

                    if (isLayoutGroupType(node.field.type)) {
                        return (
                            <Fragment key={node.field.id}>
                                {showRowBreak ? (
                                    <div
                                        className="col-span-1 h-0 overflow-hidden md:col-span-2"
                                        aria-hidden
                                        data-row-break
                                    />
                                ) : null}
                                <div className="col-span-1 min-w-0 md:col-span-2">
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
                                                activeFieldId={activeFieldId}
                                                listDragging={listDragging}
                                                rowBreakFieldIds={
                                                    rowBreakFieldIds
                                                }
                                            />
                                        ) : null}
                                        <PanelAddSectionControl
                                            parent={node.field}
                                            collectionId={collectionId}
                                            allFields={allFields}
                                            empty={node.children.length === 0}
                                        />
                                    </GroupNestDropZone>
                                </div>
                            </Fragment>
                        );
                    }

                    return (
                        <Fragment key={node.field.id}>
                            {showRowBreak ? (
                                <div
                                    className="col-span-1 h-0 overflow-hidden md:col-span-2"
                                    aria-hidden
                                    data-row-break
                                />
                            ) : null}
                            <SortableCollectionFieldRow
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
                                openPartnerSlot={openPartnerSlot}
                                forceFullRowPlaceholder={
                                    forceFullRowPlaceholder
                                }
                                listDragging={listDragging}
                                suppressGhostSlot={suppressGhostSlot}
                            />
                        </Fragment>
                    );
                })}
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
    const [fieldTree, setFieldTree] = useState<
        FieldTreeNode<CollectionFieldRow>[] | null
    >(() => {
        const initialGroups = new Map<number, string | null>();
        for (const field of fields) {
            initialGroups.set(field.id, getFieldGroupName(field));
        }
        const withGroups = fieldsWithGroupOverrides(fields, initialGroups);
        const hasAnyGroup = withGroups.some(
            (field) =>
                isLayoutGroupType(field.type) ||
                getFieldGroupName(field) !== null,
        );

        return hasAnyGroup ? buildFieldTree(withGroups) : null;
    });
    const rowBreakFieldIdsRef = useRef(rowBreakFieldIds);
    const fieldGroupsRef = useRef(fieldGroups);
    const fieldTreeRef = useRef(fieldTree);
    const orderedFieldsRef = useRef(orderedFields);
    const orderAtDragStartRef = useRef<number[]>([]);
    const rowBreakAtDragStartRef = useRef<number[]>([]);
    const groupsAtDragStartRef = useRef<Map<number, string | null>>(new Map());
    /** Pending parent for the active field; mirrored live during drag for FLIP preview. */
    const pendingActiveGroupRef = useRef<string | null | undefined>(undefined);
    const pendingBeforeSiblingRef = useRef<number | null>(null);
    const dropIntentRef = useRef<DropIntent | null>(null);
    const dropLayoutIntentRef = useRef<DropLayoutIntent>(null);
    const dropTargetFieldIdRef = useRef<number | null>(null);
    const activeFieldIdRef = useRef<number | null>(null);
    const latestDragOverRef = useRef<DragOverEvent | null>(null);
    const dragOverRafRef = useRef<number | null>(null);
    const overridesCacheRef = useRef<{
        fields: CollectionFieldRow[];
        groups: Map<number, string | null>;
        result: CollectionFieldRow[];
    } | null>(null);

    orderedFieldsRef.current = orderedFields;
    rowBreakFieldIdsRef.current = rowBreakFieldIds;
    fieldGroupsRef.current = fieldGroups;
    fieldTreeRef.current = fieldTree;
    dropTargetFieldIdRef.current = dropTargetFieldId;

    const getFieldsWithOverrides = (): CollectionFieldRow[] => {
        const fieldsNow = orderedFieldsRef.current;
        const groupsNow = fieldGroupsRef.current;
        const cached = overridesCacheRef.current;

        if (
            cached &&
            cached.fields === fieldsNow &&
            cached.groups === groupsNow
        ) {
            return cached.result;
        }

        const result = fieldsWithGroupOverrides(fieldsNow, groupsNow);
        overridesCacheRef.current = {
            fields: fieldsNow,
            groups: groupsNow,
            result,
        };

        return result;
    };

    // Collision `pointerCoordinates` lag behind the real cursor (and Playwright).
    // Always listen; clear when not dragging. window.* survives Vite HMR splits.
    // Re-run intent on move: dnd-kit skips onDragOver when `over` is unchanged,
    // so open-partner beside (same row, empty column) would stick as below-new-row.
    useEffect(() => {
        const onPointerMove = (event: MouseEvent | PointerEvent): void => {
            const win = window as ExternaFieldDndWindow;
            const dragging =
                win.__externaFieldDndActiveId ?? activeFieldIdRef.current;

            if (dragging === null || dragging === undefined) {
                return;
            }

            const next = { x: event.clientX, y: event.clientY };
            setWindowDragPointer(next);
            latestCollisionPointer = next;

            // Beside SoT via window binding (HMR-safe). Empty partner column
            // under the real pointer wins even when over id is unchanged.
            const besideApplied =
                win.__externaApplyOpenPartnerBeside?.(next) ?? false;

            if (!besideApplied) {
                win.__externaScheduleDragOverProcess?.();
            }
        };

        window.addEventListener('pointermove', onPointerMove, {
            passive: true,
        });
        window.addEventListener('mousemove', onPointerMove, { passive: true });

        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('mousemove', onPointerMove);
            setWindowDragPointer(null);
        };
    }, []);

    useEffect(() => {
        // Don't clobber live surgical tree / optimistic order mid-drag.
        if (activeFieldIdRef.current !== null) {
            return;
        }

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
        overridesCacheRef.current = null;

        const withGroups = fieldsWithGroupOverrides(fields, nextFieldGroups);
        const hasAnyGroup = withGroups.some(
            (field) =>
                isLayoutGroupType(field.type) ||
                getFieldGroupName(field) !== null,
        );
        const nextTree = hasAnyGroup ? buildFieldTree(withGroups) : null;
        fieldTreeRef.current = nextTree;
        setFieldTree(nextTree);

        orderedFieldsRef.current = fields;
        setOrderedFields(fields);
    }, [fields]);

    useEffect(() => {
        return () => {
            if (dragOverRafRef.current !== null) {
                cancelAnimationFrame(dragOverRafRef.current);
            }
        };
    }, []);

    const hasGroups = fieldTree !== null;

    const fieldsForLayout = useMemo(
        () => fieldsWithRowBreakOverrides(orderedFields, rowBreakFieldIds),
        [orderedFields, rowBreakFieldIds],
    );

    const colSpans = useMemo(
        () => getFieldGridColSpans(fieldsForLayout),
        [fieldsForLayout],
    );

    const sensors = useSensors(
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

    const fieldDragOverlayAnimation: DropAnimation = {
        duration: 150,
        easing: 'ease',
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: {
                    opacity: '0',
                },
            },
        }),
    };

    const handleDragStart = (event: DragStartEvent): void => {
        const id = Number(event.active.id);
        // Measure before flushSync / tree collapse — display:none zeros offsetWidth.
        const measured =
            event.active.rect.current.initial ??
            event.active.rect.current.translated;
        const widthFromRect = measured?.width;

        if (widthFromRect && widthFromRect > 0) {
            setGhostWidth(widthFromRect);
        } else {
            const draggedElement = document.querySelector(
                `[data-sortable-id="${String(event.active.id)}"]`,
            );

            if (draggedElement instanceof HTMLElement) {
                setGhostWidth(draggedElement.offsetWidth);
            }
        }

        flushSync(() => {
            setActiveFieldId(id);
        });
        activeFieldIdRef.current = id;
        (window as ExternaFieldDndWindow).__externaFieldDndActiveId = id;
        latestCollisionPointer = null;
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;
        dropIntentRef.current = null;
        dropLayoutIntentRef.current = null;
        orderAtDragStartRef.current = orderedFields.map((field) => field.id);
        rowBreakAtDragStartRef.current = Array.from(
            rowBreakFieldIdsRef.current,
        );
        groupsAtDragStartRef.current = new Map(fieldGroupsRef.current);
    };

    /** Same-parent live reorder — flat block + surgical tree sibling reorder. */
    const applyLiveTreeMove = (
        activeId: number,
        parentGroup: string | null,
        beforeSiblingId: number | null,
    ): void => {
        const currentFields = orderedFieldsRef.current;
        const moved = moveSameParentSiblingBlock(
            currentFields,
            fieldGroupsRef.current,
            activeId,
            beforeSiblingId,
        );

        if (moved === currentFields) {
            return;
        }

        orderedFieldsRef.current = moved;
        overridesCacheRef.current = null;
        setOrderedFields(moved);

        const currentTree = fieldTreeRef.current;

        if (currentTree) {
            const nextTree = reorderTreeSiblings(
                currentTree,
                parentGroup,
                activeId,
                beforeSiblingId,
            );

            if (nextTree !== currentTree) {
                fieldTreeRef.current = nextTree;
                setFieldTree(nextTree);
            }
        }
    };

    /**
     * Highlight nest-into only — do not live-mutate the tree.
     * Live nest + header sibling-reorder oscillate (body↔header) and can blow
     * React's update depth when dragging a group past other groups.
     */
    const canNestActiveUnderParent = (
        activeType: string,
        parentName: string | null,
        fields: CollectionFieldRow[],
    ): boolean => {
        if (parentName === null) {
            return true;
        }

        const parent = fields.find((field) => field.name === parentName);

        if (!parent) {
            return false;
        }

        return canNestFieldIntoGroup(activeType, parent.type);
    };

    const previewNestIntoGroup = (
        activeFieldRow: CollectionFieldRow,
        groupField: CollectionFieldRow,
    ): boolean => {
        const fieldsWithOverrides = getFieldsWithOverrides();

        if (
            !canNestFieldIntoGroup(activeFieldRow.type, groupField.type) ||
            wouldCreateGroupCycle(
                fieldsWithOverrides,
                activeFieldRow.name,
                groupField.name,
            )
        ) {
            return false;
        }

        if (
            dropTargetFieldIdRef.current === groupField.id &&
            dropLayoutIntentRef.current === 'into-group' &&
            pendingActiveGroupRef.current === groupField.name &&
            pendingBeforeSiblingRef.current === null
        ) {
            return true;
        }

        pendingActiveGroupRef.current = groupField.name;
        pendingBeforeSiblingRef.current = null;
        dropTargetFieldIdRef.current = groupField.id;
        setDropTargetFieldId(groupField.id);
        setDropIntent('after');
        dropIntentRef.current = 'after';
        setDropLayoutIntent('into-group');
        dropLayoutIntentRef.current = 'into-group';

        return true;
    };

    const commitRowBreakFieldIds = (next: Set<number>): void => {
        if (numberSetsEqual(next, rowBreakFieldIdsRef.current)) {
            return;
        }

        rowBreakFieldIdsRef.current = next;
        setRowBreakFieldIds(next);
    };

    const processDragOver = (event: DragOverEvent): void => {
        const { active, over } = event;
        const ordered = orderedFieldsRef.current;

        if (over === null) {
            if (
                dropTargetFieldIdRef.current !== null ||
                dropIntentRef.current !== null ||
                dropLayoutIntentRef.current !== null
            ) {
                dropTargetFieldIdRef.current = null;
                setDropTargetFieldId(null);
                setDropIntent(null);
                dropIntentRef.current = null;
                setDropLayoutIntent(null);
                dropLayoutIntentRef.current = null;
            }

            return;
        }

        const activeFieldIdNumber = Number(active.id);
        const activeFieldRow = ordered.find(
            (field) => field.id === activeFieldIdNumber,
        );

        if (!activeFieldRow) {
            return;
        }

        const nestGroupId = parseGroupDropId(over.id);
        let overFieldId = Number(over.id);
        let overField =
            nestGroupId === null
                ? ordered.find((f) => f.id === overFieldId)
                : undefined;
        if (nestGroupId !== null) {
            const groupField = ordered.find(
                (field) => field.id === nestGroupId,
            );

            if (
                groupField &&
                isLayoutGroupType(groupField.type) &&
                groupField.id !== activeFieldIdNumber
            ) {
                const fieldsWithOverrides = getFieldsWithOverrides();
                const activeParent =
                    fieldGroupsRef.current.get(activeFieldIdNumber) ??
                    getFieldGroupName(activeFieldRow);
                const alreadyInside =
                    activeParent === groupField.name ||
                    fieldIsInsideGroup(
                        fieldsWithOverrides,
                        fieldGroupsRef.current,
                        activeFieldIdNumber,
                        groupField.name,
                    );

                // Already a member: body hits must NOT abort dragOver (that froze
                // stale before/after and left the ghost disagreeing with intent).
                // Remap to the sibling field under the pointer and continue.
                if (alreadyInside) {
                    const pointer = latestCollisionPointer;
                    // Overlay sits under the cursor — walk the stack for a real row.
                    const hits =
                        pointer !== null
                            ? document.elementsFromPoint(pointer.x, pointer.y)
                            : [];
                    let remappedId = NaN;

                    for (const hit of hits) {
                        if (!(hit instanceof Element)) {
                            continue;
                        }

                        const sortable = hit.closest('[data-sortable-id]');

                        if (!(sortable instanceof HTMLElement)) {
                            continue;
                        }

                        const id = Number(
                            sortable.getAttribute('data-sortable-id'),
                        );

                        if (
                            Number.isFinite(id) &&
                            id !== activeFieldIdNumber
                        ) {
                            remappedId = id;
                            break;
                        }
                    }

                    if (!Number.isFinite(remappedId)) {
                        return;
                    }

                    overFieldId = remappedId;
                    overField = ordered.find((f) => f.id === overFieldId);

                    if (!overField) {
                        return;
                    }
                } else {
                    previewNestIntoGroup(activeFieldRow, groupField);
                    return;
                }
            } else {
                return;
            }
        }

        if (!overField) {
            return;
        }

        // Half drag: if the pointer sits on a half row, that half is SoT — not
        // the full-width neighbor collision often returns.
        const zonePointer = getWindowDragPointer() ?? latestCollisionPointer;

        if (
            zonePointer !== null &&
            getFieldLayoutWidth(activeFieldRow.settings) === 'half'
        ) {
            const halfUnderPointer = halfFieldIdInPointerRow(
                zonePointer,
                activeFieldIdNumber,
            );

            if (
                halfUnderPointer !== null &&
                halfUnderPointer !== overFieldId
            ) {
                const halfField = ordered.find(
                    (field) => field.id === halfUnderPointer,
                );

                if (halfField) {
                    overFieldId = halfUnderPointer;
                    overField = halfField;
                }
            }
        }

        // Open-partner beside must run before nest-permission early returns —
        // a stale below-new-row otherwise sticks when canNest aborts the frame.
        const liveOverRectEarly = liveSortableRect(overFieldId);
        const emptyPartnerEarly = document.querySelector(
            `[data-sortable-id="${overFieldId}"] [data-empty-partner-slot]`,
        );
        const winPtrEarly = (
            window as Window & {
                __externaFieldDndPointer?: { x: number; y: number } | null;
            }
        ).__externaFieldDndPointer;
        const earlyPtr = winPtrEarly ?? latestCollisionPointer;
        const openBesideEarly =
            getFieldLayoutWidth(activeFieldRow.settings) === 'half' &&
            emptyPartnerEarly instanceof HTMLElement &&
            openPartnerBesideFromPointer(
                earlyPtr,
                emptyPartnerEarly.getBoundingClientRect(),
                liveOverRectEarly,
                document.querySelector(
                    `[data-sortable-id="${overFieldId}"][data-open-partner-slot]`,
                ) !== null,
            );

        if (openBesideEarly) {
            const besideIntent = {
                overFieldId,
                intent: 'after' as const,
                layoutIntent: 'beside' as const,
            };
            dropTargetFieldIdRef.current = besideIntent.overFieldId;
            setDropTargetFieldId(besideIntent.overFieldId);
            setDropIntent(besideIntent.intent);
            dropIntentRef.current = besideIntent.intent;
            setDropLayoutIntent(besideIntent.layoutIntent);
            dropLayoutIntentRef.current = besideIntent.layoutIntent;
            const nextRowBreakFieldIds = new Set(rowBreakFieldIdsRef.current);
            nextRowBreakFieldIds.delete(activeFieldIdNumber);
            nextRowBreakFieldIds.delete(besideIntent.overFieldId);
            commitRowBreakFieldIds(nextRowBreakFieldIds);
            pendingActiveGroupRef.current =
                fieldGroupsRef.current.get(overFieldId) ??
                getFieldGroupName(overField);
            const siblings = getFieldsWithOverrides().filter(
                (field) =>
                    (fieldGroupsRef.current.get(field.id) ??
                        getFieldGroupName(field)) ===
                        pendingActiveGroupRef.current &&
                    field.id !== activeFieldIdNumber,
            );
            const overSiblingIndex = siblings.findIndex(
                (field) => field.id === overFieldId,
            );
            pendingBeforeSiblingRef.current =
                siblings[overSiblingIndex + 1]?.id ?? null;

            return;
        }

        const fieldsWithOverrides = getFieldsWithOverrides();
        const parentForActive =
            fieldGroupsRef.current.get(overFieldId) ??
            getFieldGroupName(overField);

        if (
            parentForActive !== null &&
            (wouldCreateGroupCycle(
                fieldsWithOverrides,
                activeFieldRow.name,
                parentForActive,
            ) ||
                !canNestActiveUnderParent(
                    activeFieldRow.type,
                    parentForActive,
                    fieldsWithOverrides,
                ))
        ) {
            return;
        }

        // Flat list OR sibling list under the same parent (tree mode).
        // Keep the active field in packing — excluding it made a paired partner
        // look like an open slot, so unpair (bottom band) was misread as beside.
        const layoutFields = hasGroups
            ? siblingFieldsForLayout(
                  fieldsWithOverrides,
                  parentForActive,
                  rowBreakFieldIdsRef.current,
              )
            : fieldsWithRowBreakOverrides(
                  ordered,
                  rowBreakFieldIdsRef.current,
              );
        const layoutColSpans = getFieldGridColSpans(layoutFields);
        // Single geometry SoT with the ghost: live DOM box + pointer (SortableJS),
        // not dnd-kit's lagging over.rect after same-parent live moves.
        const liveOverRect = liveOverRectEarly;
        let intentResult = computeFieldDropIntent(
            event,
            layoutFields,
            layoutColSpans,
            activeFieldRow,
            getWindowDragPointer() ?? latestCollisionPointer,
            { id: overFieldId, rect: liveOverRect },
        );

        // DOM SoT for paired stack-below (open-partner beside handled above).
        const overHasOpenPartnerDom =
            document.querySelector(
                `[data-sortable-id="${overFieldId}"][data-open-partner-slot]`,
            ) !== null;
        const translated = event.active.rect.current.translated;
        const hitY =
            earlyPtr?.y ??
            (translated
                ? translated.top + translated.height / 2
                : null);

        if (
            intentResult !== null &&
            getFieldLayoutWidth(activeFieldRow.settings) === 'half' &&
            getFieldLayoutWidth(overField.settings) === 'half' &&
            liveOverRect !== null &&
            !overHasOpenPartnerDom
        ) {
            const bandY = liveOverRect.top + liveOverRect.height * 0.45;
            const overlayBottom = translated
                ? translated.top + translated.height * 0.7
                : null;
            const stackY = Math.max(hitY ?? 0, overlayBottom ?? 0);

            if (stackY >= bandY) {
                intentResult = {
                    ...intentResult,
                    intent: 'after',
                    layoutIntent: 'below-new-row',
                };
            }
        }

        if (intentResult !== null) {
            // beside / below-new-row: always after over so a break on active
            // lands on the trailing half (leading-half breaks are packing no-ops).
            const resolvedIntent = intentForLayoutDrop(
                intentResult.intent,
                intentResult.layoutIntent,
            );
            let beforeSiblingId: number | null = null;

            if (hasGroups) {
                if (resolvedIntent === 'before') {
                    beforeSiblingId = intentResult.overFieldId;
                } else {
                    // Insert before the next same-parent sibling after `over`, else append.
                    const siblings = fieldsWithOverrides.filter(
                        (field) =>
                            (fieldGroupsRef.current.get(field.id) ??
                                getFieldGroupName(field)) === parentForActive &&
                            field.id !== activeFieldIdNumber,
                    );
                    const overSiblingIndex = siblings.findIndex(
                        (field) => field.id === intentResult.overFieldId,
                    );
                    const nextSibling = siblings[overSiblingIndex + 1];
                    beforeSiblingId = nextSibling?.id ?? null;
                }
            }

            const sameDropUi =
                dropTargetFieldIdRef.current === intentResult.overFieldId &&
                dropIntentRef.current === resolvedIntent &&
                dropLayoutIntentRef.current === intentResult.layoutIntent;
            const sameSlot =
                !hasGroups ||
                (pendingActiveGroupRef.current === parentForActive &&
                    pendingBeforeSiblingRef.current === beforeSiblingId);

            if (sameDropUi && sameSlot) {
                return;
            }

            pendingActiveGroupRef.current = parentForActive;

            if (!sameDropUi) {
                dropTargetFieldIdRef.current = intentResult.overFieldId;
                setDropTargetFieldId(intentResult.overFieldId);
                setDropIntent(resolvedIntent);
                dropIntentRef.current = resolvedIntent;
                setDropLayoutIntent(intentResult.layoutIntent);
                dropLayoutIntentRef.current = intentResult.layoutIntent;
            }

            const overLayoutWidth = getFieldLayoutWidth(overField.settings);
            const activeLayoutWidth = getFieldLayoutWidth(
                activeFieldRow.settings,
            );
            const forceHalfRowBreak = shouldForceHalfRowBreakForVerticalDrop(
                activeLayoutWidth,
                overLayoutWidth,
                intentResult.layoutIntent,
            );

            if (intentResult.layoutIntent === 'beside') {
                const nextRowBreakFieldIds = new Set(
                    rowBreakFieldIdsRef.current,
                );
                nextRowBreakFieldIds.delete(activeFieldIdNumber);
                // Partner no longer needs a forced break either.
                nextRowBreakFieldIds.delete(intentResult.overFieldId);
                commitRowBreakFieldIds(nextRowBreakFieldIds);
            } else if (
                intentResult.layoutIntent === 'below-new-row' ||
                forceHalfRowBreak
            ) {
                const nextRowBreakFieldIds = new Set(
                    rowBreakFieldIdsRef.current,
                );
                // Half above/below full (or stack below): own row so live grid
                // never packs half|full side-by-side.
                nextRowBreakFieldIds.add(activeFieldIdNumber);
                commitRowBreakFieldIds(nextRowBreakFieldIds);
            } else {
                // Restore this field's break to drag-start (clear transient half↔full force).
                const nextRowBreakFieldIds = new Set(
                    rowBreakFieldIdsRef.current,
                );
                const startedWithBreak =
                    rowBreakAtDragStartRef.current.includes(activeFieldIdNumber);

                if (startedWithBreak) {
                    nextRowBreakFieldIds.add(activeFieldIdNumber);
                } else {
                    nextRowBreakFieldIds.delete(activeFieldIdNumber);
                }

                commitRowBreakFieldIds(nextRowBreakFieldIds);
            }

            if (hasGroups) {
                pendingBeforeSiblingRef.current = beforeSiblingId;

                const currentParent =
                    fieldGroupsRef.current.get(activeFieldIdNumber) ??
                    getFieldGroupName(activeFieldRow);

                // ponytail: live-move only within the current parent. Cross-parent
                // nest/unnest is drop-time only — live nest while dragging a group
                // past other groups' children oscillates and hits max update depth.
                // Active half: no live-move except paired stack-below. Half→full
                // live-move was yanking the partner away under a stale aim point
                // (pointer still on the old half cell → wrong full-row target).
                const activeIsHalf =
                    getFieldLayoutWidth(activeFieldRow.settings) === 'half';
                const overIsHalf =
                    getFieldLayoutWidth(overField.settings) === 'half';
                const overLayoutIndex = layoutFields.findIndex(
                    (field) => field.id === intentResult.overFieldId,
                );
                const overHasOpenPartner =
                    overLayoutIndex !== -1 &&
                    halfFieldHasOpenPartnerSlot(
                        layoutFields,
                        layoutColSpans,
                        overLayoutIndex,
                    );
                const halfHalfStack =
                    activeIsHalf &&
                    overIsHalf &&
                    intentResult.layoutIntent === 'below-new-row' &&
                    !overHasOpenPartner;

                if (
                    parentForActive === currentParent &&
                    (!activeIsHalf || halfHalfStack)
                ) {
                    applyLiveTreeMove(
                        activeFieldIdNumber,
                        parentForActive,
                        beforeSiblingId,
                    );
                }
            }
        } else if (hasGroups) {
            // Same id over/active (ghost under pointer): keep last nest/beside preview.
            if (dropTargetFieldIdRef.current !== overFieldId) {
                dropTargetFieldIdRef.current = overFieldId;
                setDropTargetFieldId(overFieldId);
            }
        }

        if (Number(active.id) === overFieldId) {
            return;
        }

        // Tree mode: order already live-updated above.
        if (hasGroups) {
            return;
        }

        // Flat half↔half: partner ghost only, except paired stack-below live-move.
        if (
            getFieldLayoutWidth(activeFieldRow.settings) === 'half' &&
            getFieldLayoutWidth(overField.settings) === 'half'
        ) {
            const overIdx = layoutFields.findIndex(
                (field) => field.id === overFieldId,
            );
            const pairedStack =
                dropLayoutIntentRef.current === 'below-new-row' &&
                overIdx !== -1 &&
                !halfFieldHasOpenPartnerSlot(
                    layoutFields,
                    layoutColSpans,
                    overIdx,
                );

            if (!pairedStack) {
                return;
            }
        }

        const intentForMove = dropIntentRef.current ?? 'after';
        const currentFields = orderedFieldsRef.current;
        const oldIndex = currentFields.findIndex(
            (field) => field.id === active.id,
        );
        const overIndex = currentFields.findIndex(
            (field) => field.id === overFieldId,
        );

        if (oldIndex === -1 || overIndex === -1) {
            return;
        }

        const targetIndex = targetIndexForFieldDrop(
            oldIndex,
            overIndex,
            intentForMove,
        );

        if (targetIndex === null) {
            return;
        }

        const nextFields = arrayMove(currentFields, oldIndex, targetIndex);
        orderedFieldsRef.current = nextFields;
        overridesCacheRef.current = null;
        setOrderedFields(nextFields);
    };

    /**
     * Pointer over another half's empty partner column → beside.
     * Independent of dnd-kit `over` identity (same-droppable moves).
     */
    const applyOpenPartnerBesideFromPointer = (
        pointer: FieldDndPointer | null,
    ): boolean => {
        const activeId =
            (window as ExternaFieldDndWindow).__externaFieldDndActiveId ??
            activeFieldIdRef.current;

        if (activeId === null || activeId === undefined || pointer === null) {
            return false;
        }

        const activeFieldRow = orderedFieldsRef.current.find(
            (field) => field.id === activeId,
        );

        if (
            !activeFieldRow ||
            getFieldLayoutWidth(activeFieldRow.settings) !== 'half'
        ) {
            return false;
        }

        // Prefer DOM hit-test (skip overlay). Fall back to geometry — empty
        // slots are often under the DragOverlay so elementsFromPoint misses them.
        let empty: HTMLElement | null = null;
        let parent: HTMLElement | null = null;

        for (const hit of document.elementsFromPoint(pointer.x, pointer.y)) {
            if (!(hit instanceof Element)) {
                continue;
            }

            if (hit.closest('[data-dnd-field-overlay]')) {
                continue;
            }

            const slot = hit.closest('[data-empty-partner-slot]');

            if (!(slot instanceof HTMLElement)) {
                continue;
            }

            const sortable = slot.closest('[data-sortable-id]');

            if (!(sortable instanceof HTMLElement)) {
                continue;
            }

            if (sortable.getAttribute('data-open-partner-slot') !== '1') {
                continue;
            }

            empty = slot;
            parent = sortable;
            break;
        }

        if (empty === null || parent === null) {
            let bestDist = Number.POSITIVE_INFINITY;

            for (const slot of document.querySelectorAll(
                '[data-empty-partner-slot]',
            )) {
                if (!(slot instanceof HTMLElement)) {
                    continue;
                }

                const sortable = slot.closest('[data-sortable-id]');

                if (!(sortable instanceof HTMLElement)) {
                    continue;
                }

                if (sortable.getAttribute('data-open-partner-slot') !== '1') {
                    continue;
                }

                const overId = Number(
                    sortable.getAttribute('data-sortable-id'),
                );

                if (!Number.isFinite(overId) || overId === activeId) {
                    continue;
                }

                const rect = slot.getBoundingClientRect();

                if (
                    pointer.x < rect.left - 8 ||
                    pointer.x > rect.right + 8 ||
                    pointer.y < rect.top - 8 ||
                    pointer.y > rect.bottom + 8
                ) {
                    continue;
                }

                const dist = Math.hypot(
                    pointer.x - (rect.left + rect.width / 2),
                    pointer.y - (rect.top + rect.height / 2),
                );

                if (dist < bestDist) {
                    bestDist = dist;
                    empty = slot;
                    parent = sortable;
                }
            }
        }

        if (empty === null || parent === null) {
            return false;
        }

        const overFieldId = Number(parent.getAttribute('data-sortable-id'));

        if (!Number.isFinite(overFieldId) || overFieldId === activeId) {
            return false;
        }

        const overField = orderedFieldsRef.current.find(
            (field) => field.id === overFieldId,
        );

        if (
            !overField ||
            getFieldLayoutWidth(overField.settings) !== 'half'
        ) {
            return false;
        }

        // Geometry already matched in the slot search above — apply beside.
        if (
            dropLayoutIntentRef.current === 'beside' &&
            dropTargetFieldIdRef.current === overFieldId &&
            dropIntentRef.current === 'after'
        ) {
            return true;
        }

        dropTargetFieldIdRef.current = overFieldId;
        setDropTargetFieldId(overFieldId);
        setDropIntent('after');
        dropIntentRef.current = 'after';
        setDropLayoutIntent('beside');
        dropLayoutIntentRef.current = 'beside';

        const nextRowBreakFieldIds = new Set(rowBreakFieldIdsRef.current);
        nextRowBreakFieldIds.delete(activeId);
        nextRowBreakFieldIds.delete(overFieldId);
        commitRowBreakFieldIds(nextRowBreakFieldIds);

        pendingActiveGroupRef.current =
            fieldGroupsRef.current.get(overFieldId) ??
            getFieldGroupName(overField);

        const siblings = getFieldsWithOverrides().filter(
            (field) =>
                (fieldGroupsRef.current.get(field.id) ??
                    getFieldGroupName(field)) ===
                    pendingActiveGroupRef.current &&
                field.id !== activeId,
        );
        const overSiblingIndex = siblings.findIndex(
            (field) => field.id === overFieldId,
        );
        pendingBeforeSiblingRef.current =
            siblings[overSiblingIndex + 1]?.id ?? null;

        return true;
    };

    (window as ExternaFieldDndWindow).__externaApplyOpenPartnerBeside =
        applyOpenPartnerBesideFromPointer;

    /** Coalesce pointer spam to one commit per frame (Directus SortableJS feel). */
    const scheduleProcessLatestDragOver = (): void => {
        if (dragOverRafRef.current !== null) {
            return;
        }

        dragOverRafRef.current = requestAnimationFrame(() => {
            dragOverRafRef.current = null;
            const latest = latestDragOverRef.current;

            if (latest) {
                processDragOver(latest);
            }

            // Pointer SoT wins after dragOver — empty-column beside must not lose
            // to a stale below-new-row from the same droppable's last compute.
            (window as ExternaFieldDndWindow).__externaApplyOpenPartnerBeside?.(
                getWindowDragPointer() ?? latestCollisionPointer,
            );
        });
    };

    (window as ExternaFieldDndWindow).__externaScheduleDragOverProcess =
        scheduleProcessLatestDragOver;

    const handleDragOver = (event: DragOverEvent | DragMoveEvent): void => {
        latestDragOverRef.current = event as DragOverEvent;
        scheduleProcessLatestDragOver();
    };

    const handleDragEnd = (event: DragEndEvent): void => {
        // Drop the trailing RAF frame — release collisions often hit a parent
        // group-drop / neighbor and would undo the live ghost the user saw
        // (e.g. below-new-row → null). Last committed dragOver refs are SoT.
        if (dragOverRafRef.current !== null) {
            cancelAnimationFrame(dragOverRafRef.current);
            dragOverRafRef.current = null;
        }

        latestDragOverRef.current = null;

        const activeId = activeFieldIdRef.current;
        let pendingGroup = pendingActiveGroupRef.current;
        let beforeSiblingId = pendingBeforeSiblingRef.current;
        const { over } = event;
        const ordered = orderedFieldsRef.current;

        // Only synthesize a drop target when dragOver never established one
        // (e.g. quick flick). Never clobber a live sibling preview.
        if (
            activeId !== null &&
            over !== null &&
            pendingGroup === undefined
        ) {
            const nestGroupId = parseGroupDropId(over.id);

            if (nestGroupId !== null) {
                const groupField = ordered.find(
                    (field) => field.id === nestGroupId,
                );
                const activeRow = ordered.find(
                    (field) => field.id === activeId,
                );
                const overrides = getFieldsWithOverrides();
                const alreadyInside =
                    groupField != null &&
                    activeRow != null &&
                    (fieldGroupsRef.current.get(activeId) ===
                        groupField.name ||
                        fieldIsInsideGroup(
                            overrides,
                            fieldGroupsRef.current,
                            activeId,
                            groupField.name,
                        ));

                if (
                    groupField &&
                    activeRow &&
                    isLayoutGroupType(groupField.type) &&
                    !alreadyInside &&
                    canNestFieldIntoGroup(activeRow.type, groupField.type) &&
                    !wouldCreateGroupCycle(
                        overrides,
                        activeRow.name,
                        groupField.name,
                    )
                ) {
                    pendingGroup = groupField.name;
                    beforeSiblingId = null;
                }
            } else {
                const overField = ordered.find(
                    (field) => field.id === Number(over.id),
                );

                if (overField) {
                    const overrides = getFieldsWithOverrides();
                    const nextParent =
                        fieldGroupsRef.current.get(overField.id) ??
                        getFieldGroupName(overField);
                    const activeRow = ordered.find(
                        (field) => field.id === activeId,
                    );

                    if (
                        nextParent !== null &&
                        activeRow &&
                        (wouldCreateGroupCycle(
                            overrides,
                            activeRow.name,
                            nextParent,
                        ) ||
                            !canNestActiveUnderParent(
                                activeRow.type,
                                nextParent,
                                overrides,
                            ))
                    ) {
                        pendingGroup =
                            fieldGroupsRef.current.get(activeId) ?? null;
                    } else {
                        pendingGroup = nextParent;
                    }

                    const intent = dropIntentRef.current ?? 'after';

                    if (intent === 'before') {
                        beforeSiblingId = overField.id;
                    } else {
                        const siblings = overrides.filter(
                            (field) =>
                                (fieldGroupsRef.current.get(field.id) ??
                                    getFieldGroupName(field)) ===
                                    pendingGroup && field.id !== activeId,
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
        (window as ExternaFieldDndWindow).__externaFieldDndActiveId = null;
        latestCollisionPointer = null;
        setGhostWidth(undefined);
        dropTargetFieldIdRef.current = null;
        setDropTargetFieldId(null);
        setDropIntent(null);
        const finalLayoutIntent = dropLayoutIntentRef.current;
        const finalIntent = intentForLayoutDrop(
            dropIntentRef.current ?? 'after',
            finalLayoutIntent,
        );
        dropIntentRef.current = null;
        setDropLayoutIntent(null);
        dropLayoutIntentRef.current = null;
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;

        // below-new-row / beside: recompute insert-after over from release target
        // (pending beforeSibling may still be from a mid-drag `before` frame).
        // Beside must land immediately after `over` so packing pairs the halves.
        if (
            hasGroups &&
            activeId !== null &&
            over !== null &&
            !parseGroupDropId(over.id) &&
            (finalLayoutIntent === 'below-new-row' ||
                finalLayoutIntent === 'beside')
        ) {
            const overField = ordered.find(
                (field) => field.id === Number(over.id),
            );
            const dropParent =
                pendingGroup !== undefined
                    ? pendingGroup
                    : overField
                      ? (fieldGroupsRef.current.get(overField.id) ??
                          getFieldGroupName(overField))
                      : undefined;

            if (overField && dropParent !== undefined) {
                pendingGroup = dropParent;
                const siblings = getFieldsWithOverrides().filter(
                    (field) =>
                        (fieldGroupsRef.current.get(field.id) ??
                            getFieldGroupName(field)) === dropParent &&
                        field.id !== activeId,
                );
                const overSiblingIndex = siblings.findIndex(
                    (field) => field.id === overField.id,
                );
                beforeSiblingId =
                    siblings[overSiblingIndex + 1]?.id ?? null;
            }
        }

        // Ensure half-row break from last dragOver is applied even if setState lagged.
        if (activeId !== null && finalLayoutIntent === 'beside') {
            const nextRowBreakFieldIds = new Set(rowBreakFieldIdsRef.current);
            nextRowBreakFieldIds.delete(activeId);

            if (over !== null && !parseGroupDropId(over.id)) {
                nextRowBreakFieldIds.delete(Number(over.id));
            }

            commitRowBreakFieldIds(nextRowBreakFieldIds);
        } else if (activeId !== null) {
            const activeRow = ordered.find((field) => field.id === activeId);
            const overRow =
                over !== null && !parseGroupDropId(over.id)
                    ? ordered.find((field) => field.id === Number(over.id))
                    : null;
            const forceBreak =
                finalLayoutIntent === 'below-new-row' ||
                (activeRow != null &&
                    overRow != null &&
                    getFieldLayoutWidth(activeRow.settings) === 'half' &&
                    shouldForceHalfRowBreakForVerticalDrop(
                        getFieldLayoutWidth(activeRow.settings),
                        getFieldLayoutWidth(overRow.settings),
                        finalLayoutIntent,
                    ));

            const nextRowBreakFieldIds = new Set(rowBreakFieldIdsRef.current);

            if (forceBreak) {
                nextRowBreakFieldIds.add(activeId);
            } else if (rowBreakAtDragStartRef.current.includes(activeId)) {
                nextRowBreakFieldIds.add(activeId);
            } else {
                nextRowBreakFieldIds.delete(activeId);
            }

            commitRowBreakFieldIds(nextRowBreakFieldIds);
        }

        let nextFields = orderedFieldsRef.current;
        let nextGroups = fieldGroupsRef.current;

        if (hasGroups && activeId !== null && pendingGroup !== undefined) {
            const moved = moveFieldInGroupTree(
                nextFields,
                nextGroups,
                activeId,
                pendingGroup,
                beforeSiblingId,
            );
            nextFields = moved.fields;
            nextGroups = moved.groups;
            fieldGroupsRef.current = nextGroups;
            orderedFieldsRef.current = nextFields;
            overridesCacheRef.current = null;
            setFieldGroups(nextGroups);
            setOrderedFields(nextFields);

            const withGroups = fieldsWithGroupOverrides(nextFields, nextGroups);
            const nextTree = buildFieldTree(withGroups);
            fieldTreeRef.current = nextTree;
            setFieldTree(nextTree);
        } else if (
            !hasGroups &&
            activeId !== null &&
            over !== null &&
            !parseGroupDropId(over.id)
        ) {
            // Flat layout: prefer live dragOver order; if still wrong, insert
            // by before/after intent (never arrayMove to overIndex — that
            // replaces a full with a half in the same grid slot).
            const overIndex = nextFields.findIndex(
                (field) => field.id === Number(over.id),
            );
            const oldIndex = nextFields.findIndex(
                (field) => field.id === activeId,
            );

            if (oldIndex !== -1 && overIndex !== -1) {
                const targetIndex = targetIndexForFieldDrop(
                    oldIndex,
                    overIndex,
                    finalIntent,
                );

                if (targetIndex !== null) {
                    nextFields = arrayMove(nextFields, oldIndex, targetIndex);
                    orderedFieldsRef.current = nextFields;
                    overridesCacheRef.current = null;
                    setOrderedFields(nextFields);
                }
            }
        }

        const currentOrderIds = nextFields.map((field) => field.id);
        const currentRowBreakIds = Array.from(
            rowBreakFieldIdsRef.current,
        ).sort((left, right) => left - right);
        const orderChanged =
            currentOrderIds.join(',') !==
            orderAtDragStartRef.current.join(',');
        const startRowBreakIds = [...rowBreakAtDragStartRef.current].sort(
            (left, right) => left - right,
        );
        const rowBreakChanged =
            currentRowBreakIds.join(',') !== startRowBreakIds.join(',');

        const currentGroups = fieldGroupsRef.current;
        const startGroups = groupsAtDragStartRef.current;
        const groupsChanged =
            currentGroups.size !== startGroups.size ||
            Array.from(currentGroups.entries()).some(
                ([id, group]) => startGroups.get(id) !== group,
            );

        if (orderChanged || rowBreakChanged || groupsChanged) {
            // Delta groups only — backend skips unchanged settings anyway, but
            // avoid walking every field on a pure order/row-break drop.
            const groupsPayload: Record<number, string | null> = {};
            if (groupsChanged) {
                for (const [id, group] of currentGroups.entries()) {
                    if (startGroups.get(id) !== group) {
                        groupsPayload[id] = group;
                    }
                }
            }

            // PageLayout uses an inner overflow-y-auto; Inertia preserveScroll
            // only covers window scroll, so restore the list container too.
            const scrollParent = findOverflowScrollParent(
                document.querySelector('[data-fields-dnd]'),
            );
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
        }
    };

    const handleDragCancel = (): void => {
        if (dragOverRafRef.current !== null) {
            cancelAnimationFrame(dragOverRafRef.current);
            dragOverRafRef.current = null;
        }

        latestDragOverRef.current = null;
        setActiveFieldId(null);
        activeFieldIdRef.current = null;
        (window as ExternaFieldDndWindow).__externaFieldDndActiveId = null;
        latestCollisionPointer = null;
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;
        dropIntentRef.current = null;
        setGhostWidth(undefined);
        dropTargetFieldIdRef.current = null;
        setDropTargetFieldId(null);
        setDropIntent(null);
        setDropLayoutIntent(null);
        dropLayoutIntentRef.current = null;
        orderedFieldsRef.current = fields;
        overridesCacheRef.current = null;
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

        const withGroups = fieldsWithGroupOverrides(fields, resetGroups);
        const hasAnyGroup = withGroups.some(
            (field) =>
                isLayoutGroupType(field.type) ||
                getFieldGroupName(field) !== null,
        );
        const nextTree = hasAnyGroup ? buildFieldTree(withGroups) : null;
        fieldTreeRef.current = nextTree;
        setFieldTree(nextTree);
    };

    const listDragging = activeFieldId !== null;

    const dropTargetForPlaceholder =
        dropTargetFieldId === null
            ? null
            : (fieldsForLayout.find(
                  (field) => field.id === dropTargetFieldId,
              ) ?? null);
    const dropTargetWidthForPlaceholder = dropTargetForPlaceholder
        ? getFieldLayoutWidth(dropTargetForPlaceholder.settings)
        : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={sortableFieldsCollisionDetection}
            measuring={fieldsDndMeasuring}
            // Auto-scroll shifts row boxes under a fixed pointer and turns
            // open-slot beside into false "past bottom" stack-below.
            autoScroll={false}
            onDragStart={handleDragStart}
            onDragMove={handleDragOver}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div
                data-fields-dnd
                data-active-field-id={activeFieldId ?? undefined}
                data-drop-target-id={dropTargetFieldId ?? undefined}
                data-drop-intent={dropIntent ?? undefined}
                data-drop-layout-intent={dropLayoutIntent ?? undefined}
            >
            {hasGroups && fieldTree ? (
                <SortableFieldTreeNodes
                    nodes={fieldTree}
                    collectionId={collectionId}
                    onEdit={onEdit}
                    // Stable during drag so untouched subtrees don't rerender for menus.
                    allFields={listDragging ? fields : orderedFields}
                    reorderEnabled
                    dropTargetFieldId={dropTargetFieldId}
                    dropIntent={dropIntent}
                    dropLayoutIntent={dropLayoutIntent}
                    activeFieldId={activeFieldId}
                    listDragging={listDragging}
                    rowBreakFieldIds={rowBreakFieldIds}
                />
            ) : (
                <SortableContext
                    items={orderedFields.map((field) => field.id)}
                    strategy={noDisplacementSortingStrategy}
                >
                    {/* Single grid like Directus .field-grid — siblings shift around the live ghost. */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {fieldsForLayout.map((field, fieldIndex) => {
                            const startsNewRow =
                                fieldStartsNewLayoutRow(field.settings) &&
                                fieldIndex > 0;
                            const colSpan = colSpans[fieldIndex] ?? 2;
                            const openPartnerSlot =
                                field.id !== activeFieldId &&
                                halfFieldHasOpenPartnerSlot(
                                    fieldsForLayout,
                                    colSpans,
                                    fieldIndex,
                                    activeFieldId,
                                );
                            const forceFullRowPlaceholder =
                                activeFieldId === field.id &&
                                dropLayoutIntent === null &&
                                getFieldLayoutWidth(field.settings) ===
                                    'half' &&
                                (dropTargetWidthForPlaceholder === 'full' ||
                                    dropTargetWidthForPlaceholder === 'fill');

                            return (
                                <Fragment key={field.id}>
                                    {startsNewRow ? (
                                        <div
                                            className="col-span-1 h-0 overflow-hidden md:col-span-2"
                                            aria-hidden
                                            data-row-break
                                        />
                                    ) : null}
                                    <SortableCollectionFieldRow
                                        field={field}
                                        colSpan={colSpan}
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
                                        allFields={
                                            listDragging ? fields : orderedFields
                                        }
                                        reorderEnabled
                                        openPartnerSlot={openPartnerSlot}
                                        forceFullRowPlaceholder={
                                            forceFullRowPlaceholder
                                        }
                                        listDragging={listDragging}
                                        suppressGhostSlot={
                                            activeFieldId === field.id &&
                                            (dropLayoutIntent ===
                                                'into-group' ||
                                                dropLayoutIntent === 'beside')
                                        }
                                    />
                                </Fragment>
                            );
                        })}
                    </div>
                </SortableContext>
            )}

            <DragOverlay dropAnimation={fieldDragOverlayAnimation}>
                {activeField !== null ? (
                    <div
                        data-dnd-field-overlay
                        style={{
                            width: ghostWidth && ghostWidth > 0 ? ghostWidth : undefined,
                            // Directus .sortable-fallback opacity
                            opacity: 0.85,
                            cursor: 'grabbing',
                        }}
                    >
                        <CollectionFieldRow
                            field={activeField}
                            collectionId={collectionId}
                            onEdit={onEdit}
                            allFields={fields}
                            reorderEnabled
                            isGhost
                            fillHeight={false}
                        />
                    </div>
                ) : null}
            </DragOverlay>
            </div>
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
