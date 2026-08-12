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
    halfOccupiedInsertDropIntent,
    halfOpenSlotDropIntent,
    halfPairedDropIntent,
    intentForLayoutDrop,
    openPartnerBesideFromPointer,
    openPartnerFieldIdFromEmptyRects,
    pointerExitsStickyBesideForStack,
    rowBreakIdsForDropFrame,
    shouldForceHalfRowBreakForVerticalDrop,
    shouldKeepStickyBeside,
    targetIndexForFieldDrop,
    type OccupiedHalfInsert,
    type StickyBesideState,
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

/** Field-grid gap — enough air for between-item / between-group inserts. */
const FIELD_LIST_GAP_CLASS = 'gap-5';

/** Directus .sortable-ghost dashed slot — shared by leaf rows and group chrome. */
const SORTABLE_GHOST_SLOT_CLASS =
    'border-dashed border-primary bg-transparent shadow-none';

/**
 * Leaf DragOverlay width — the visible card, not the sortable hit wrapper.
 * Lone halves expand to col-span-2 for the empty partner column; measuring the
 * wrapper made half ghosts jump to full width (Directus keeps half).
 */
function measureLeafDragGhostWidth(activeId: UniqueIdentifier): number | undefined {
    const sortable = document.querySelector(
        `[data-sortable-id="${String(activeId)}"]`,
    );

    if (!(sortable instanceof HTMLElement)) {
        return undefined;
    }

    if (sortable.getAttribute('data-open-partner-slot') === '1') {
        const partner = sortable.querySelector('[data-empty-partner-slot]');
        const card = partner?.previousElementSibling;

        if (card instanceof HTMLElement && card.offsetWidth > 0) {
            return card.offsetWidth;
        }
    }

    const card = sortable.querySelector(':scope > div.bg-card, :scope > div > div.bg-card');

    if (card instanceof HTMLElement && card.offsetWidth > 0) {
        return card.offsetWidth;
    }

    return sortable.offsetWidth > 0 ? sortable.offsetWidth : undefined;
}

/**
 * Measure the full group chrome for DragOverlay (header + nest body).
 * Sortable handle is only the header row — SortableJS/Directus ghost the whole block.
 * Snapshot HTML before isDragging opacity so the fallback matches the live block.
 */
function measureGroupDragGhost(activeId: UniqueIdentifier): {
    width: number;
    height: number;
    html: string;
} | null {
    const sortable = document.querySelector(
        `[data-sortable-id="${String(activeId)}"]`,
    );
    const container = sortable?.closest('[data-group-container]');

    if (!(container instanceof HTMLElement)) {
        return null;
    }

    const clone = container.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-group-container');
    clone.removeAttribute('data-group-field-id');
    // Match leaf DragOverlay chrome (primary ring) — resting muted border looks muddy at 0.85.
    clone.className =
        'space-y-2 rounded-lg border border-primary/40 bg-muted/30 p-3 shadow-lg ring-2 ring-primary/20';
    clone.querySelectorAll('[data-nest-drop-ghost]').forEach((el) => {
        el.remove();
    });
    clone.querySelectorAll('[data-group-drop]').forEach((el) => {
        el.removeAttribute('data-group-drop');
    });
    clone.querySelectorAll('[data-sortable-id]').forEach((el) => {
        el.removeAttribute('data-sortable-id');
    });

    return {
        width: container.offsetWidth,
        height: container.offsetHeight,
        html: clone.outerHTML,
    };
}

/** Full item box for hit-testing — group chrome, else the sortable row. */
function fieldItemRect(sortable: HTMLElement): DOMRect {
    const container = sortable.closest('[data-group-container]');

    if (container instanceof HTMLElement) {
        return container.getBoundingClientRect();
    }

    return sortable.getBoundingClientRect();
}

/** True when pointer is on the top/bottom insert band of a group nest body. */
function isPointerOnGroupInsertEdge(
    pointer: { x: number; y: number },
    groupFieldId: number,
    /**
     * Same-parent sibling reorder (Category past Section3 under Tab1): widen
     * bottom/top bands so nest-into does not eat the exit toward after-group.
     */
    wideForSiblingReorder = false,
): boolean {
    // Thin bands only — Directus treats most of the nested field-grid as nest
    // (min-height ~54px + padding). Wide edges made nest feel pixel-precise.
    const body = document.querySelector(
        `[data-group-drop="${groupFieldId}"]`,
    );
    const container =
        body ??
        document.querySelector(`[data-group-field-id="${groupFieldId}"]`);

    if (!(container instanceof HTMLElement)) {
        return false;
    }

    const rect = container.getBoundingClientRect();

    // Empty / short nest bodies (tab/accordion sections): most of the pad used
    // to be 100% nest-into, so a seam between sibling sections was impossible.
    // Top/bottom bands → sibling insert; only the middle stays nest-into.
    // Empty short pads need a real mid nest zone — oversized bands made
    // empty-det nest flaky (55% aim landed in the insert edge).
    if (rect.height < 80) {
        const empty =
            body instanceof HTMLElement &&
            body.querySelector('[data-sortable-id]') === null;
        const topBand = empty
            ? Math.max(10, rect.height * 0.22)
            : Math.max(22, rect.height * 0.42);
        const bottomBand = empty
            ? Math.max(8, rect.height * 0.18)
            : Math.max(14, rect.height * 0.22);

        return (
            pointer.y < rect.top + topBand ||
            pointer.y > rect.bottom - bottomBand
        );
    }

    if (wideForSiblingReorder) {
        const topBand = Math.min(36, rect.height * 0.28);
        const bottomBand = Math.min(72, Math.max(36, rect.height * 0.38));

        return (
            pointer.y < rect.top + topBand ||
            pointer.y > rect.bottom - bottomBand
        );
    }

    const band = Math.min(20, rect.height * 0.1);

    return pointer.y < rect.top + band || pointer.y > rect.bottom - band;
}

function pointerInsideGroupChrome(
    pointer: { x: number; y: number },
    groupFieldId: number,
): boolean {
    const container = document.querySelector(
        `[data-group-field-id="${groupFieldId}"]`,
    );

    if (!(container instanceof HTMLElement)) {
        return false;
    }

    const rect = container.getBoundingClientRect();

    return (
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom
    );
}

/**
 * Direct child cells of a group's nest body tree grid (not nested descendants).
 */
function directChildCellsInGroupBody(
    groupFieldId: number,
    activeId: number,
): Array<{
    id: number;
    top: number;
    bottom: number;
    left: number;
    right: number;
}> {
    const body = document.querySelector(`[data-group-drop="${groupFieldId}"]`);

    if (!(body instanceof HTMLElement)) {
        return [];
    }

    const grid =
        [...body.querySelectorAll('[data-tree-depth]')].find((node) => {
            if (!(node instanceof HTMLElement)) {
                return false;
            }

            // Innermost grid whose parent chain hits this body first.
            return node.closest('[data-group-drop]') === body;
        }) ?? null;

    if (!(grid instanceof HTMLElement)) {
        return [];
    }

    const cells: Array<{
        id: number;
        top: number;
        bottom: number;
        left: number;
        right: number;
    }> = [];

    for (const child of grid.children) {
        if (
            !(child instanceof HTMLElement) ||
            child.hasAttribute('data-row-break')
        ) {
            continue;
        }

        const container =
            child.querySelector(':scope > [data-group-container]') ??
            child.querySelector(':scope > * > [data-group-container]');
        const sortable = child.matches('[data-sortable-id]')
            ? child
            : child.querySelector(':scope > [data-sortable-id]');

        let id = NaN;

        if (container instanceof HTMLElement) {
            id = Number(container.getAttribute('data-group-field-id'));
        } else if (sortable instanceof HTMLElement) {
            id = Number(sortable.getAttribute('data-sortable-id'));
        }

        if (!Number.isFinite(id) || id === activeId) {
            continue;
        }

        const rect = child.getBoundingClientRect();
        cells.push({
            id,
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
        });
    }

    return cells;
}

/**
 * Pointer on/after the last direct child inside a parent group (incl. short
 * nest pad + slight overshoot) → append after that child. Keeps Tab1→after
 * Section3 from flipping into nested Notes or out to the next root sibling.
 */
function lastDirectChildIdForInsideParentPad(
    pointer: { x: number; y: number },
    groupFieldId: number,
    activeId: number,
): number | null {
    const cells = directChildCellsInGroupBody(groupFieldId, activeId);

    if (cells.length === 0) {
        return null;
    }

    const last = cells[cells.length - 1];
    const group = document.querySelector(
        `[data-group-field-id="${groupFieldId}"]`,
    );

    if (!(group instanceof HTMLElement)) {
        return null;
    }

    const groupRect = group.getBoundingClientRect();
    // Sticky past the chrome so a short nest pad stays hittable; stop before
    // the midpoint to the next sibling of this group. Keep overshoot small so
    // nested Section3 does not claim Tab1's pad below it as after-Notes.
    let padBottom = groupRect.bottom + 14;
    const groupCell = group.closest('[data-tree-depth] > *');
    const nextCell = groupCell?.nextElementSibling;

    if (nextCell instanceof HTMLElement) {
        const nextRect = nextCell.getBoundingClientRect();
        const mid = (groupRect.bottom + nextRect.top) / 2;
        padBottom = Math.min(padBottom, mid);
    }

    // Still inside group chrome counts even when last child ends higher.
    const inGroupChrome =
        pointer.y >= groupRect.top &&
        pointer.y <= groupRect.bottom &&
        pointer.x >= groupRect.left - 8 &&
        pointer.x <= groupRect.right + 8;

    if (
        pointer.x < groupRect.left - 8 ||
        pointer.x > groupRect.right + 8 ||
        pointer.y <= last.bottom - 10 ||
        (!inGroupChrome && pointer.y > padBottom)
    ) {
        return null;
    }

    if (!inGroupChrome && pointer.y > groupRect.bottom + 14) {
        return null;
    }

    return last.id;
}

/**
 * Pointer in the vertical seam between two consecutive sibling cells in any
 * tree grid (root or nested under tabs/accordion/raw) → sibling insert.
 * Prefer this over nest-into-parent so the ghost follows the opened slot
 * instead of the parent's bottom nest pad. Skips the active cell so a
 * live-moved ghost between A|B still counts as the A↔B seam.
 * Returns the sibling id to aim (before/after refined by geometry below).
 */
function siblingIdInTreeGap(
    pointer: { x: number; y: number },
    activeId: number,
): number | null {
    type Cell = {
        id: number;
        top: number;
        bottom: number;
        left: number;
        right: number;
    };

    let bestGapId: number | null = null;
    let bestGapDepth = -1;
    // After-last prefers the shallowest grid: Tab1 pad below Section3 must aim
    // Section3, not the last half packed inside Section3's deeper grid.
    let bestAfterId: number | null = null;
    let bestAfterDepth = Number.POSITIVE_INFINITY;

    for (const grid of document.querySelectorAll('[data-tree-depth]')) {
        if (!(grid instanceof HTMLElement)) {
            continue;
        }

        const depth = Number(grid.getAttribute('data-tree-depth') ?? -1);

        if (!Number.isFinite(depth)) {
            continue;
        }

        const gridRect = grid.getBoundingClientRect();
        // Nested panels need a wider approach band than root.
        const approach = depth > 0 ? 32 : 20;

        if (
            pointer.y < gridRect.top - approach ||
            pointer.y > gridRect.bottom + approach ||
            pointer.x < gridRect.left - 8 ||
            pointer.x > gridRect.right + 8
        ) {
            continue;
        }

        const cells: Cell[] = [];

        for (const child of grid.children) {
            if (
                !(child instanceof HTMLElement) ||
                child.hasAttribute('data-row-break')
            ) {
                continue;
            }

            // Outermost group in this cell, else the cell's sortable leaf.
            const container =
                child.querySelector(':scope > [data-group-container]') ??
                child.querySelector(':scope > * > [data-group-container]');
            const sortable =
                child.matches('[data-sortable-id]')
                    ? child
                    : child.querySelector(':scope > [data-sortable-id]');

            let id = NaN;

            if (container instanceof HTMLElement) {
                id = Number(container.getAttribute('data-group-field-id'));
            } else if (sortable instanceof HTMLElement) {
                id = Number(sortable.getAttribute('data-sortable-id'));
            }

            // Skip active — live-moved placeholder between A|B must not split the seam.
            if (!Number.isFinite(id) || id === activeId) {
                continue;
            }

            const rect = child.getBoundingClientRect();
            cells.push({
                id,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
            });
        }

        const band = depth > 0 ? 36 : 18;
        const slop = depth > 0 ? 28 : 14;
        let gapHitId: number | null = null;

        for (let index = 0; index < cells.length - 1; index += 1) {
            const above = cells[index];
            const below = cells[index + 1];
            const gapTop = above.bottom;
            const gapBottom = below.top;
            const xMin = Math.min(above.left, below.left);
            const xMax = Math.max(above.right, below.right);

            if (pointer.x < xMin || pointer.x > xMax) {
                continue;
            }

            if (gapBottom - gapTop < 2) {
                const seam = (gapTop + gapBottom) / 2;

                if (pointer.y >= seam - band && pointer.y <= seam + band) {
                    gapHitId = pointer.y >= seam ? below.id : above.id;
                    break;
                }

                continue;
            }

            if (
                pointer.y >= gapTop - slop &&
                pointer.y <= gapBottom + slop
            ) {
                const mid = (gapTop + gapBottom) / 2;
                gapHitId = pointer.y >= mid ? below.id : above.id;
                break;
            }
        }

        if (gapHitId !== null && depth >= bestGapDepth) {
            bestGapId = gapHitId;
            bestGapDepth = depth;
        }

        // Past last sibling, still inside this grid/pad → after-last sibling
        // insert (Tab1 body below Section 3). Beats nest-into parent flicker.
        if (cells.length > 0 && depth < bestAfterDepth) {
            const last = cells[cells.length - 1];
            const padBottom = Math.max(
                gridRect.bottom + approach,
                last.bottom + (depth > 0 ? 48 : 28),
            );
            const xMin = Math.min(last.left, gridRect.left);
            const xMax = Math.max(last.right, gridRect.right);

            if (
                pointer.x >= xMin - 8 &&
                pointer.x <= xMax + 8 &&
                pointer.y > last.bottom - 4 &&
                pointer.y <= padBottom
            ) {
                bestAfterId = last.id;
                bestAfterDepth = depth;
            }
        }
    }

    if (bestGapId !== null && bestAfterId !== null) {
        // Nested after-last (Tab1 pad below Section3, depth 1) must beat an
        // outer root gap (Tab1↔Section2, depth 0) — otherwise the pad always
        // unnests to the next root sibling.
        if (bestAfterDepth > bestGapDepth) {
            return bestAfterId;
        }

        return bestGapId;
    }

    return bestGapId ?? bestAfterId;
}

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

/**
 * Intent geometry for a field: header when the pointer is on it, else full group
 * chrome. Header-only boxes made "after" unreachable once remapped off a nest body.
 */
function liveDropIntentRect(
    fieldId: number,
    pointer: { x: number; y: number } | null,
): {
    top: number;
    left: number;
    width: number;
    height: number;
} | null {
    const node = document.querySelector(`[data-sortable-id="${fieldId}"]`);

    if (!(node instanceof HTMLElement)) {
        return null;
    }

    const header = node.getBoundingClientRect();

    if (
        pointer !== null &&
        pointer.y >= header.top &&
        pointer.y <= header.bottom
    ) {
        return {
            top: header.top,
            left: header.left,
            width: header.width,
            height: header.height,
        };
    }

    const item = fieldItemRect(node);

    return {
        top: item.top,
        left: item.left,
        width: item.width,
        height: item.height,
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

/**
 * Which open half owns the empty-partner column under the pointer.
 * DOM hit first (skip overlay); geometry fallback when overlay occludes slots.
 */
function openPartnerFieldIdUnderPointer(
    pointer: { x: number; y: number },
    activeId: number,
): number | null {
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

        const overId = Number(sortable.getAttribute('data-sortable-id'));

        if (Number.isFinite(overId) && overId !== activeId) {
            return overId;
        }
    }

    const slots: { overId: number; rect: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    } }[] = [];

    for (const slot of document.querySelectorAll('[data-empty-partner-slot]')) {
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

        const overId = Number(sortable.getAttribute('data-sortable-id'));

        if (!Number.isFinite(overId) || overId === activeId) {
            continue;
        }

        const r = slot.getBoundingClientRect();
        slots.push({
            overId,
            rect: {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
            },
        });
    }

    return openPartnerFieldIdFromEmptyRects(pointer, slots, activeId);
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

        // Header sortable wins over nest body — otherwise closestCenter / a tall
        // group chrome maps mid-header aims to into-group and the ghost lands
        // elsewhere than the sibling insert the user is pointing at.
        // (Sticky nest while already into-group is handled in processDragOver.)
        const sortable = hit.closest('[data-sortable-id]');

        if (sortable instanceof HTMLElement) {
            const id = Number(sortable.getAttribute('data-sortable-id'));

            if (Number.isFinite(id) && id !== Number(activeId)) {
                return id;
            }
        }

        const groupDrop = hit.closest('[data-group-drop], [id^="group-drop:"]');

        if (groupDrop instanceof HTMLElement) {
            const raw =
                groupDrop.getAttribute('data-group-drop') ??
                groupDrop.id.replace(/^group-drop:/, '');
            const groupId = Number(raw);

            if (Number.isFinite(groupId) && groupId !== Number(activeId)) {
                // Edge band → sibling sortable (insert before/after the group block).
                if (isPointerOnGroupInsertEdge(pointer, groupId)) {
                    return groupId;
                }

                return `${GROUP_DROP_PREFIX}${groupId}`;
            }
        }
    }

    // Gap / overlay hole / sticky-chrome occlusion: pick the best field under
    // the pointer by geometry. Tall group chrome must NOT steal hits from a
    // sibling header that sits lower in the list but still under the cursor.
    type Contained = { id: number; area: number; top: number; isHeader: boolean };
    const contained: Contained[] = [];
    type RowHit = { id: number; rect: DOMRect; edgeDist: number };
    const rowHits: RowHit[] = [];
    let nearestGap: { id: number; dist: number } | null = null;

    for (const node of document.querySelectorAll('[data-sortable-id]')) {
        if (!(node instanceof HTMLElement)) {
            continue;
        }

        const id = Number(node.getAttribute('data-sortable-id'));

        if (!Number.isFinite(id) || id === Number(activeId)) {
            continue;
        }

        const headerRect = node.getBoundingClientRect();

        if (
            pointer.x >= headerRect.left &&
            pointer.x <= headerRect.right &&
            pointer.y >= headerRect.top &&
            pointer.y <= headerRect.bottom
        ) {
            contained.push({
                id,
                area: headerRect.width * headerRect.height,
                top: headerRect.top,
                isHeader: true,
            });
            continue;
        }

        // Nest only via the body droppable rect — never the full group chrome.
        // Tall groups were swallowing sibling headers that sit below them in
        // document order while still overlapping in y during scroll/sticky.
        const nestBody = document.querySelector(
            `[data-group-drop="${id}"]`,
        );

        if (nestBody instanceof HTMLElement) {
            const bodyRect = nestBody.getBoundingClientRect();

            if (
                pointer.x >= bodyRect.left &&
                pointer.x <= bodyRect.right &&
                pointer.y >= bodyRect.top &&
                pointer.y <= bodyRect.bottom
            ) {
                contained.push({
                    id,
                    area: bodyRect.width * bodyRect.height,
                    top: bodyRect.top,
                    isHeader: false,
                });
                continue;
            }
        } else {
            const rect = fieldItemRect(node);

            if (
                pointer.x >= rect.left &&
                pointer.x <= rect.right &&
                pointer.y >= rect.top &&
                pointer.y <= rect.bottom
            ) {
                contained.push({
                    id,
                    area: rect.width * rect.height,
                    top: rect.top,
                    isHeader: false,
                });
                continue;
            }
        }

        const rect = fieldItemRect(node);

        const edgeDist =
            pointer.y < rect.top
                ? rect.top - pointer.y
                : pointer.y > rect.bottom
                  ? pointer.y - rect.bottom
                  : 0;

        if (edgeDist > 0 && edgeDist <= 28) {
            if (nearestGap === null || edgeDist < nearestGap.dist) {
                nearestGap = { id, dist: edgeDist };
            }
        }

        if (pointer.y >= rect.top - 16 && pointer.y <= rect.bottom + 16) {
            rowHits.push({ id, rect, edgeDist });
        }
    }

    if (contained.length > 0) {
        // Prefer header hits, then the smallest box (leaf/header over tall group).
        contained.sort((left, right) => {
            if (left.isHeader !== right.isHeader) {
                return left.isHeader ? -1 : 1;
            }

            if (left.area !== right.area) {
                return left.area - right.area;
            }

            return right.top - left.top;
        });

        const best = contained[0];

        if (best.isHeader) {
            return best.id;
        }

        return isPointerOnGroupInsertEdge(pointer, best.id)
            ? best.id
            : `${GROUP_DROP_PREFIX}${best.id}`;
    }

    if (nearestGap !== null) {
        return nearestGap.id;
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

/**
 * 2-col half packing cursor after processing `throughIndex` inclusive.
 * `true` ⇒ that index opened a half-row still awaiting a partner.
 */
function halfPackingAwaitingPartnerThrough(
    fields: CollectionFieldRow[],
    throughIndex: number,
): boolean {
    let awaitingHalfPartner = false;

    for (let index = 0; index <= throughIndex; index++) {
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

    return awaitingHalfPartner;
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

        const activeIndex = fields.findIndex(
            (field) => field.id === ignoreFieldId,
        );

        // True packed pair (packing SoT) → swap, not empty-column beside.
        if (activeIndex !== -1) {
            const occupiedActive = occupiedHalfPairPartner(fields, activeIndex);

            if (
                occupiedActive !== null &&
                occupiedActive.partnerIndex === fieldIndex
            ) {
                return false;
            }
        }

        // Dragging the next half away: keep this field's empty partner when it
        // already had an open slot (stacked via starts_new_row). Filtering
        // active out would let the following sibling pack into the column.
        if (
            activeIndex === fieldIndex + 1 &&
            halfFieldHasOpenPartnerSlot(fields, colSpans, fieldIndex, null)
        ) {
            return true;
        }

        let withoutActive = fields.filter(
            (field) => field.id !== ignoreFieldId,
        );

        // Dragging one seat of a packed pair opens that row — do not let the
        // next lone half (e.g. Notes under abvl|Priority) absorb into abvl.
        if (activeIndex !== -1) {
            const occupiedActive = occupiedHalfPairPartner(fields, activeIndex);

            if (occupiedActive !== null) {
                const pairEnd = Math.max(
                    activeIndex,
                    occupiedActive.partnerIndex,
                );
                const nextAfterPair = fields[pairEnd + 1];

                if (nextAfterPair !== undefined) {
                    withoutActive = withoutActive.map((field) => {
                        if (field.id !== nextAfterPair.id) {
                            return field;
                        }

                        if (fieldStartsNewLayoutRow(field.settings)) {
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
            }
        }

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
    if (!halfPackingAwaitingPartnerThrough(fields, fieldIndex)) {
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
 * Partner of an occupied half pair (no empty column), or null when open/lone.
 *
 * Packing SoT — adjacency alone is not enough: after abvl|Priority the next
 * half (Notes) starts a new visual row without layout_starts_new_row, and must
 * not be treated as Priority's trailing mate (that forced Priority↔Notes swap).
 */
function occupiedHalfPairPartner(
    fields: CollectionFieldRow[],
    fieldIndex: number,
): { partnerIndex: number; role: 'leading' | 'trailing' } | null {
    const field = fields[fieldIndex];

    if (
        field === undefined ||
        getFieldLayoutWidth(field.settings) !== 'half'
    ) {
        return null;
    }

    const prev = fields[fieldIndex - 1];
    const next = fields[fieldIndex + 1];

    // Trailing: packing before this index is awaiting a partner (prev opened row).
    if (
        prev !== undefined &&
        getFieldLayoutWidth(prev.settings) === 'half' &&
        !fieldStartsNewLayoutRow(field.settings) &&
        halfPackingAwaitingPartnerThrough(fields, fieldIndex - 1)
    ) {
        return { partnerIndex: fieldIndex - 1, role: 'trailing' };
    }

    // Leading: this index opened a row and next half fills it.
    if (
        next !== undefined &&
        getFieldLayoutWidth(next.settings) === 'half' &&
        !fieldStartsNewLayoutRow(next.settings) &&
        halfPackingAwaitingPartnerThrough(fields, fieldIndex)
    ) {
        return { partnerIndex: fieldIndex + 1, role: 'leading' };
    }

    return null;
}

/**
 * Directus: aiming at the right edge of the *left* half must keep that half as
 * over. Collision / nearest-half often reports the trailing partner instead,
 * which makes relativeX negative and forces stack-below.
 */
function remapOccupiedPairOverFromPointer(
    fields: CollectionFieldRow[],
    overFieldId: number,
    pointer: { x: number; y: number },
    activeId: number,
): number | null {
    const overIndex = fields.findIndex((field) => field.id === overFieldId);

    if (overIndex === -1) {
        return null;
    }

    const occupied = occupiedHalfPairPartner(fields, overIndex);

    if (occupied === null || occupied.role !== 'trailing') {
        return null;
    }

    const leading = fields[occupied.partnerIndex];

    if (leading === undefined || leading.id === activeId) {
        return null;
    }

    const leadingEl = document.querySelector(
        `[data-sortable-id="${leading.id}"]`,
    );

    if (!(leadingEl instanceof HTMLElement)) {
        return null;
    }

    const rect = leadingEl.getBoundingClientRect();

    // Pointer still on the leading card (incl. its right edge) → aim at leading.
    if (
        pointer.x >= rect.left - 4 &&
        pointer.x <= rect.right + 12 &&
        pointer.y >= rect.top - 8 &&
        pointer.y <= rect.bottom + 8
    ) {
        return leading.id;
    }

    return null;
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
    /** Flat field ids at drag start — paired half invert-swap stick. */
    orderAtDragStart?: number[],
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
    // Exception: still at drag-start order — past mid means "insert after"
    // (section↔section / stack) or we'd never reorder the leading sibling.
    const startIds = orderAtDragStart ?? [];
    const startActive = startIds.indexOf(Number(active.id));
    const startOver = startIds.indexOf(overFieldId);
    const startedBeforeOver =
        startActive !== -1 && startOver !== -1
            ? startActive < startOver
            : null;
    const verticalIntent = (y: number): DropIntent => {
        if (ghostAlreadyBefore) {
            if (startedBeforeOver === true) {
                return y > 0.5 ? 'after' : 'before';
            }

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

    // Half↔half already paired: same-row swap, or deep-bottom unwrap.
    // External half onto an occupied pair → Directus insert (displace partner).
    if (overLayoutWidth === 'half' && activeLayoutWidth === 'half') {
        const occupied = occupiedHalfPairPartner(layoutFields, overIndex);
        // Active is the other seat of this occupied pair → L↔R swap / unpair.
        const activeIsPairMate =
            occupied !== null &&
            activeIndex !== -1 &&
            activeIndex === occupied.partnerIndex;

        if (occupied !== null && !activeIsPairMate) {
            const insert = halfOccupiedInsertDropIntent(
                relativeX,
                relativeY,
                occupied.role === 'leading',
            );

            return {
                overFieldId,
                intent: insert.intent,
                layoutIntent: insert.layoutIntent,
            };
        }

        // Do not inflate Y with overlay-bottom — that pushed mid-card into the
        // unwrap band and blocked left↔right swap. Stack-below uses pointer Y.
        const paired = halfPairedDropIntent(
            relativeX,
            relativeY,
            verticalIntent(relativeY),
            activeIndex !== -1 ? activeIndex < overIndex : null,
            startedBeforeOver,
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
 * Animate sibling slides while sorting (Directus SortableJS ~150ms).
 *
 * defaultAnimateLayoutChanges gates on `wasDragging`, which skips FLIP for
 * siblings during an active drag — so live DOM reorders jumped with no slide.
 * While sorting we always animate; on settle keep the default path.
 */
const fieldAnimateLayoutChanges: AnimateLayoutChanges = (args) => {
    const { isSorting, wasDragging, transition } = args;

    if (!transition) {
        return false;
    }

    if (isSorting) {
        return true;
    }

    if (wasDragging) {
        return defaultAnimateLayoutChanges(args);
    }

    return false;
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
    // Group chrome (dashed slot / fallback ring) lives on GroupNestDropZone /
    // DragOverlay — the header row stays transparent like the resting group.
    const leafGhostChrome = isGhost && !isGroup;
    const leafInListGhost = showInListGhost && !isGroup;

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                fillHeight && 'h-full',
                isGroup ? 'border-transparent bg-transparent' : 'bg-card',
                leafGhostChrome
                    ? 'cursor-grabbing border-primary/40 bg-card shadow-lg ring-2 ring-primary/20'
                    : isGhost && isGroup
                      ? 'cursor-grabbing border-transparent bg-transparent'
                      : leafInListGhost
                        ? // Directus .sortable-ghost: dashed slot, hide contents
                          SORTABLE_GHOST_SLOT_CLASS
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
    /** True while any sortable is active — skip menus + non-FLIP CSS transitions. */
    listDragging?: boolean;
    /** Nest-into: unlit origin slot (ghost lives in the nest zone). */
    suppressGhostSlot?: boolean;
    /**
     * Start a new grid row without an empty spacer track — spacers ate a full
     * `gap` on both sides and doubled the space above lone halves.
     */
    forceNewRow?: boolean;
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
    listDragging = false,
    suppressGhostSlot = false,
    forceNewRow = false,
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
        // Directus SortableJS animation: 150ms + sharp ease (items settle under pointer).
        animateLayoutChanges: fieldAnimateLayoutChanges,
        transition: {
            duration: 150,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
        },
    });

    const isFullSpan = colSpan === 2;
    // Full-width items never get horizontal FLIP (half beside / grid reflow).
    // Matches SortableJS vertical direction when target isn't a shareable half.
    const clampedTransform =
        transform && isFullSpan ? { ...transform, x: 0 } : transform;

    // ponytail: never display:none / collapse before DragOverlay measures — that zeros
    // activeNodeRect and the clone jumps top-left. Keep the dashed in-list ghost
    // (isDragging) so layout FLIP still has a real box to animate around.
    const style = {
        transform: CSS.Transform.toString(clampedTransform),
        transition:
            transition ?? 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
        ...(listDragging ? { willChange: 'transform' as const } : null),
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
                // col-start forces a new track without a gap-eating spacer row.
                forceNewRow && 'md:col-start-1',
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
    /** This group is the active drag — full-block dashed slot (Directus .sortable-ghost). */
    originGhost?: boolean;
    /** Nest/beside preview: keep layout for hit-testing, unlit. */
    suppressGhostSlot?: boolean;
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
    originGhost = false,
    suppressGhostSlot = false,
    header,
    children,
}: GroupNestDropZoneProps) {
    const { setNodeRef } = useDroppable({
        id: groupDropId(groupFieldId),
    });

    // Exclusive chrome when ghosting — groupSurfaceClass's dark:border-sidebar-border
    // otherwise overrides border-primary and the dashed slot looks dimmer than leaf ghosts.
    const surfaceClass = originGhost
        ? cn('space-y-2 rounded-lg border p-3', SORTABLE_GHOST_SLOT_CLASS)
        : suppressGhostSlot
          ? 'space-y-2 rounded-lg border border-transparent bg-transparent p-3 shadow-none'
          : groupSurfaceClass;

    return (
        <div
            data-group-container={groupName}
            data-group-field-id={groupFieldId}
            className={cn(
                surfaceClass,
                active &&
                    'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
            )}
        >
            <div
                className={cn(
                    (originGhost || suppressGhostSlot) && 'opacity-0',
                )}
            >
                {header}
                <div
                    ref={setNodeRef}
                    data-group-drop={groupFieldId}
                    className={cn(
                        // Directus nested field-grid: min-height ~54px + pad so
                        // nest-into has real surface (not a 1px sliver).
                        'rounded-md px-2',
                        empty
                            ? 'flex min-h-14 flex-col justify-center py-3'
                            : 'min-h-14 space-y-2 py-2',
                    )}
                >
                    {children}
                    {/* Nest ghost only while into-group — idle min-h pad was
                        adding a permanent gap under the last nested field. */}
                    {active ? (
                        <div
                            aria-hidden
                            data-nest-drop-ghost
                            data-nest-drop-pad
                            className={cn(
                                'min-h-14 rounded-md border',
                                SORTABLE_GHOST_SLOT_CLASS,
                            )}
                        />
                    ) : null}
                </div>
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
    /** Nesting depth — 0 at collection root (for DnD QA / hit tests). */
    depth?: number;
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
        <div className={cn('flex flex-col', FIELD_LIST_GAP_CLASS)}>
            {layoutRows.map((row) => (
                <div
                    key={row.map((item) => item.node.field.id).join('-')}
                    className={cn(
                        'grid grid-cols-1 md:grid-cols-2',
                        FIELD_LIST_GAP_CLASS,
                    )}
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
    depth = 0,
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

    return (
        <SortableContext
            items={siblingIds}
            strategy={noDisplacementSortingStrategy}
        >
            <div
                className={cn(
                    'grid grid-cols-1 md:grid-cols-2',
                    FIELD_LIST_GAP_CLASS,
                )}
                data-tree-depth={depth}
            >
                {flatItems.map(({ node, colSpan, startsNewRow }, index) => {
                    const isIntoTarget =
                        dropTargetFieldId === node.field.id &&
                        dropLayoutIntent === 'into-group';
                    const forceNewRow =
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
                    // Beside / into-group: origin unlit (partner column or nest
                    // pad is the slot; DragOverlay carries the field visual).
                    const suppressGhostSlot =
                        activeFieldId === node.field.id &&
                        (dropLayoutIntent === 'beside' ||
                            dropLayoutIntent === 'into-group');

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
                            listDragging={listDragging}
                            suppressGhostSlot={suppressGhostSlot}
                            forceNewRow={forceNewRow}
                        />
                    );

                    if (isLayoutGroupType(node.field.type)) {
                        return (
                            <div
                                key={node.field.id}
                                className={cn(
                                    'col-span-1 min-w-0 md:col-span-2',
                                    forceNewRow && 'md:col-start-1',
                                )}
                            >
                                    <GroupNestDropZone
                                        groupFieldId={node.field.id}
                                        groupName={node.field.name}
                                        active={isIntoTarget}
                                        empty={node.children.length === 0}
                                        originGhost={
                                            activeFieldId === node.field.id &&
                                            !suppressGhostSlot
                                        }
                                        suppressGhostSlot={suppressGhostSlot}
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
                                                depth={depth + 1}
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
                            openPartnerSlot={openPartnerSlot}
                            listDragging={listDragging}
                            suppressGhostSlot={suppressGhostSlot}
                            forceNewRow={forceNewRow}
                        />
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
        <div className={cn('flex flex-col', FIELD_LIST_GAP_CLASS)}>
            {layoutRows?.map((row) => (
                <div
                    key={row.map((item) => item.field.id).join('-')}
                    className={cn(
                        'grid grid-cols-1 md:grid-cols-2',
                        FIELD_LIST_GAP_CLASS,
                    )}
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
    const [ghostHeight, setGhostHeight] = useState<number | undefined>();
    const [groupGhostHtml, setGroupGhostHtml] = useState<string | null>(null);
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
    /** Sticky open-partner beside — packing clears empty DOM; don't thrash. */
    const stickyBesideRef = useRef<StickyBesideState | null>(null);
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
        const activeRow = orderedFieldsRef.current.find(
            (field) => field.id === id,
        );
        const groupGhost =
            activeRow && isLayoutGroupType(activeRow.type)
                ? measureGroupDragGhost(event.active.id)
                : null;

        if (groupGhost) {
            setGhostWidth(groupGhost.width);
            setGhostHeight(groupGhost.height);
            setGroupGhostHtml(groupGhost.html);
        } else {
            setGroupGhostHtml(null);
            setGhostHeight(undefined);
            const cardWidth = measureLeafDragGhostWidth(event.active.id);
            const measured =
                event.active.rect.current.initial ??
                event.active.rect.current.translated;
            const widthFromRect = measured?.width;
            const activeIsHalf =
                activeRow !== undefined &&
                getFieldLayoutWidth(activeRow.settings) === 'half';

            // Half: always the card column (wrapper may be full-row for open partner).
            if (activeIsHalf && cardWidth && cardWidth > 0) {
                setGhostWidth(cardWidth);
            } else if (widthFromRect && widthFromRect > 0) {
                setGhostWidth(widthFromRect);
            } else if (cardWidth && cardWidth > 0) {
                setGhostWidth(cardWidth);
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
        stickyBesideRef.current = null;
        orderAtDragStartRef.current = orderedFields.map((field) => field.id);
        rowBreakAtDragStartRef.current = Array.from(
            rowBreakFieldIdsRef.current,
        );
        groupsAtDragStartRef.current = new Map(fieldGroupsRef.current);
    };

    /** Same- or cross-parent live reorder — ghost tracks the drop slot (Directus). */
    const applyLiveGroupMove = (
        activeId: number,
        parentGroup: string | null,
        beforeSiblingId: number | null,
    ): void => {
        const currentFields = orderedFieldsRef.current;
        const currentGroups = fieldGroupsRef.current;
        const activeField = currentFields.find((field) => field.id === activeId);
        const currentParent =
            currentGroups.get(activeId) ??
            (activeField ? getFieldGroupName(activeField) : null);

        if (currentParent === parentGroup) {
            const moved = moveSameParentSiblingBlock(
                currentFields,
                currentGroups,
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

            return;
        }

        // Cross-parent (unnest / reparent to another group's sibling list).
        // Nest-into stays preview-only — this path is sibling insert only.
        const moved = moveFieldInGroupTree(
            currentFields,
            currentGroups,
            activeId,
            parentGroup,
            beforeSiblingId,
        );

        if (
            moved.fields === currentFields &&
            moved.groups === currentGroups
        ) {
            return;
        }

        fieldGroupsRef.current = moved.groups;
        orderedFieldsRef.current = moved.fields;
        overridesCacheRef.current = null;
        setFieldGroups(moved.groups);
        setOrderedFields(moved.fields);

        const nextTree = buildFieldTree(
            fieldsWithGroupOverrides(moved.fields, moved.groups),
        );
        fieldTreeRef.current = nextTree;
        setFieldTree(nextTree);
    };

    /**
     * Highlight nest-into only — do not live-mutate into the nest zone.
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

        // Highlight nest-into only — never live-append into the group.
        // Live nest ↔ root-gap sibling fought (flicker, wrong drop, vanish,
        // Accordion/Tabs auto-wrap growth). Commit on dragEnd from pending refs.
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

    /** Measure over card + empty partner (empty may be gone after beside packing). */
    const measureHalfPartnerGeometry = (
        overFieldId: number,
    ): {
        overRect: {
            left: number;
            right: number;
            top: number;
            bottom: number;
            width: number;
        } | null;
        emptyRect: {
            left: number;
            right: number;
            top: number;
            bottom: number;
        } | null;
    } => {
        const overEl = document.querySelector(
            `[data-sortable-id="${overFieldId}"]`,
        );
        const emptyEl = overEl?.querySelector('[data-empty-partner-slot]');
        const overRect =
            overEl instanceof HTMLElement
                ? (() => {
                      const r = overEl.getBoundingClientRect();

                      return {
                          left: r.left,
                          right: r.right,
                          top: r.top,
                          bottom: r.bottom,
                          width: r.width,
                      };
                  })()
                : null;
        const emptyRect =
            emptyEl instanceof HTMLElement
                ? (() => {
                      const r = emptyEl.getBoundingClientRect();

                      return {
                          left: r.left,
                          right: r.right,
                          top: r.top,
                          bottom: r.bottom,
                      };
                  })()
                : null;

        return { overRect, emptyRect };
    };

    /** Keep stack-below while pointer stays in the bottom band of the stack target. */
    const isHoldingStackBelowBand = (
        pointer: { x: number; y: number } | null,
    ): boolean => {
        if (
            dropLayoutIntentRef.current !== 'below-new-row' ||
            pointer === null
        ) {
            return false;
        }

        const stackOverId = dropTargetFieldIdRef.current;

        if (stackOverId === null) {
            return false;
        }

        const { overRect: stackRect } =
            measureHalfPartnerGeometry(stackOverId);

        if (stackRect === null) {
            return false;
        }

        const stackHeight = stackRect.bottom - stackRect.top;
        const holding =
            stackHeight > 0 &&
            pointer.y >= stackRect.top + stackHeight * 0.75;

        return holding;
    };

    /** Commit empty-partner / sticky beside; live-place active after over. */
    const commitBesideAfter = (
        activeId: number,
        overFieldId: number,
        overField: CollectionFieldRow,
    ): void => {
        // Hold stack-below: a one-frame unpair opens the partner column under a
        // past-bottom pointer; refusing beside here keeps drop SoT on stack.
        if (
            isHoldingStackBelowBand(
                getWindowDragPointer() ?? latestCollisionPointer,
            )
        ) {
            return;
        }

        stickyBesideRef.current = { activeId, overId: overFieldId };

        // Place active after over so row-break packing pairs the aimed partner.
        // Clearing the break alone packs with the previous neighbor (stacked
        // halves: beside-top wrongly filled mid|active). Kitchen-sink has
        // groups → use sibling live-move even for root null-parent fields.
        const parentForOver =
            fieldGroupsRef.current.get(overFieldId) ??
            getFieldGroupName(overField);

        if (hasGroups) {
            const siblings = getFieldsWithOverrides().filter(
                (field) =>
                    (fieldGroupsRef.current.get(field.id) ??
                        getFieldGroupName(field)) === parentForOver &&
                    field.id !== activeId,
            );
            const overSiblingIndex = siblings.findIndex(
                (field) => field.id === overFieldId,
            );
            applyLiveGroupMove(
                activeId,
                parentForOver,
                siblings[overSiblingIndex + 1]?.id ?? null,
            );
        } else {
            const current = orderedFieldsRef.current;
            const oldIndex = current.findIndex(
                (field) => field.id === activeId,
            );
            const overIndex = current.findIndex(
                (field) => field.id === overFieldId,
            );

            if (oldIndex !== -1 && overIndex !== -1) {
                const targetIndex = targetIndexForFieldDrop(
                    oldIndex,
                    overIndex,
                    'after',
                );

                if (targetIndex !== null) {
                    const nextFields = arrayMove(
                        current,
                        oldIndex,
                        targetIndex,
                    );
                    orderedFieldsRef.current = nextFields;
                    overridesCacheRef.current = null;
                    setOrderedFields(nextFields);
                }
            }
        }

        if (
            dropLayoutIntentRef.current === 'beside' &&
            dropTargetFieldIdRef.current === overFieldId &&
            dropIntentRef.current === 'after'
        ) {
            // Still refresh row-breaks from drag-start (idempotent).
            commitRowBreakFieldIds(
                rowBreakIdsForDropFrame(
                    rowBreakAtDragStartRef.current,
                    activeId,
                    overFieldId,
                    'beside',
                    'after',
                    false,
                    false,
                ),
            );

            return;
        }

        dropTargetFieldIdRef.current = overFieldId;
        setDropTargetFieldId(overFieldId);
        setDropIntent('after');
        dropIntentRef.current = 'after';
        setDropLayoutIntent('beside');
        dropLayoutIntentRef.current = 'beside';

        commitRowBreakFieldIds(
            rowBreakIdsForDropFrame(
                rowBreakAtDragStartRef.current,
                activeId,
                overFieldId,
                'beside',
                'after',
                false,
                false,
            ),
        );

        pendingActiveGroupRef.current = parentForOver;

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
    };

    const processDragOver = (event: DragOverEvent): void => {
        const { active, over } = event;
        const ordered = orderedFieldsRef.current;

        if (over === null) {
            // Keep last sibling/nest preview — release / gaps often report null
            // briefly and clearing here made dragEnd synthesize a wrong nest.
            return;
        }

        const activeFieldIdNumber = Number(active.id);
        const activeFieldRow = ordered.find(
            (field) => field.id === activeFieldIdNumber,
        );

        if (!activeFieldRow) {
            return;
        }

        // Sticky open-partner beside: packing clears empty DOM + looks "paired".
        // Hold beside until the pointer clearly leaves the partner zone — but
        // never across a different field's empty-partner column (retarget).
        const stickyBeside = stickyBesideRef.current;
        const stickyPointer =
            getWindowDragPointer() ?? latestCollisionPointer;
        const partnerUnderPointer =
            stickyPointer !== null &&
            getFieldLayoutWidth(activeFieldRow.settings) === 'half'
                ? openPartnerFieldIdUnderPointer(
                      stickyPointer,
                      activeFieldIdNumber,
                  )
                : null;

        if (
            stickyBeside !== null &&
            stickyBeside.activeId === activeFieldIdNumber &&
            getFieldLayoutWidth(activeFieldRow.settings) === 'half'
        ) {
            const stickyOver = ordered.find(
                (field) => field.id === stickyBeside.overId,
            );
            const { overRect: stickyOverRect, emptyRect: stickyEmpty } =
                measureHalfPartnerGeometry(stickyBeside.overId);

            if (
                stickyOver &&
                getFieldLayoutWidth(stickyOver.settings) === 'half' &&
                shouldKeepStickyBeside(
                    stickyBeside,
                    activeFieldIdNumber,
                    stickyPointer,
                    stickyOverRect,
                    stickyEmpty,
                    partnerUnderPointer,
                )
            ) {
                commitBesideAfter(
                    activeFieldIdNumber,
                    stickyBeside.overId,
                    stickyOver,
                );

                return;
            }

            // Entering another open partner → drop sticky so the frame retargets.
            if (
                partnerUnderPointer !== null &&
                partnerUnderPointer !== stickyBeside.overId
            ) {
                stickyBesideRef.current = null;
            } else if (
                pointerExitsStickyBesideForStack(
                    stickyPointer,
                    stickyOverRect,
                    stickyEmpty,
                )
            ) {
                stickyBesideRef.current = null;
            }
        }

        const nestGroupIdFromOver = parseGroupDropId(over.id);
        let overFieldId = Number(over.id);
        let overField =
            nestGroupIdFromOver === null
                ? ordered.find((f) => f.id === overFieldId)
                : undefined;

        // Pointer DOM SoT wins over dnd-kit `over` (nested SortableContexts +
        // live moves leave stale over ids → ghost elsewhere than the drop).
        const pointerForOver =
            getWindowDragPointer() ?? latestCollisionPointer;
        let nestGroupId = nestGroupIdFromOver;

        if (pointerForOver !== null) {
            let underId = droppableIdUnderPointer(
                pointerForOver,
                activeFieldIdNumber,
            );

            // Gap between sibling cells (root or nested under tabs/raw/…) →
            // sibling insert. Beats nest-into so the ghost tracks the opened
            // slot instead of the parent’s bottom nest pad.
            let gapSiblingId = siblingIdInTreeGap(
                pointerForOver,
                activeFieldIdNumber,
            );
            const activeParentNameEarly =
                fieldGroupsRef.current.get(activeFieldIdNumber) ??
                getFieldGroupName(activeFieldRow);

            // Deep nest body owns the pointer — clear outer sibling/after-last
            // seams (empty-det nest was stolen by the root gap to the next field
            // after the approach-from-below path).
            {
                const nestBodyHit = document
                    .elementsFromPoint(pointerForOver.x, pointerForOver.y)
                    .find(
                        (el) =>
                            el instanceof Element &&
                            el.closest('[data-group-drop]') !== null &&
                            el.closest('[data-dnd-field-overlay]') === null,
                    );
                const nestBody = nestBodyHit?.closest('[data-group-drop]');
                const nestBodyId =
                    nestBody instanceof HTMLElement
                        ? Number(
                              nestBody.getAttribute('data-group-drop') ??
                                  NaN,
                          )
                        : NaN;

                if (
                    Number.isFinite(nestBodyId) &&
                    nestBodyId !== activeFieldIdNumber
                ) {
                    const nestGroupField = ordered.find(
                        (field) => field.id === nestBodyId,
                    );
                    const nestParentName = nestGroupField
                        ? (fieldGroupsRef.current.get(nestBodyId) ??
                          getFieldGroupName(nestGroupField))
                        : null;
                    const sameParentNest =
                        activeParentNameEarly !== null &&
                        nestParentName !== null &&
                        activeParentNameEarly === nestParentName;

                    if (
                        !isPointerOnGroupInsertEdge(
                            pointerForOver,
                            nestBodyId,
                            sameParentNest,
                        )
                    ) {
                        const bodyRect =
                            nestBody instanceof HTMLElement
                                ? nestBody.getBoundingClientRect()
                                : null;
                        // Strict center only — edge/seam aims must stay sibling
                        // (between-groups). Empty-det nest aims mid-body.
                        const margin =
                            bodyRect !== null
                                ? bodyRect.height < 80 &&
                                  nestBody instanceof HTMLElement &&
                                  nestBody.querySelector(
                                      '[data-sortable-id]',
                                  ) === null
                                    ? Math.min(
                                          12,
                                          Math.max(6, bodyRect.height * 0.18),
                                      )
                                    : Math.min(
                                          22,
                                          Math.max(10, bodyRect.height * 0.28),
                                      )
                                : 0;
                        const inDeep =
                            bodyRect !== null &&
                            pointerForOver.x >= bodyRect.left &&
                            pointerForOver.x <= bodyRect.right &&
                            pointerForOver.y >= bodyRect.top + margin &&
                            pointerForOver.y <= bodyRect.bottom - margin;

                        if (inDeep) {
                            const nestEmpty =
                                directChildCellsInGroupBody(
                                    nestBodyId,
                                    activeFieldIdNumber,
                                ).length === 0;

                            // Only reclaim empty nest pads from leaf gap steals
                            // (empty-det). Non-empty / between-group seams keep
                            // sibling SoT.
                            if (nestEmpty) {
                                if (gapSiblingId !== null) {
                                    const gapField = ordered.find(
                                        (field) => field.id === gapSiblingId,
                                    );
                                    const gapParent = gapField
                                        ? (fieldGroupsRef.current.get(
                                              gapSiblingId,
                                          ) ?? getFieldGroupName(gapField))
                                        : null;
                                    const gapIsGroupSiblingSeam =
                                        gapSiblingId === nestBodyId ||
                                        (gapField !== undefined &&
                                            isLayoutGroupType(gapField.type) &&
                                            gapParent === nestParentName);

                                    if (!gapIsGroupSiblingSeam) {
                                        gapSiblingId = null;
                                        underId = groupDropId(nestBodyId);
                                    }
                                } else {
                                    underId = groupDropId(nestBodyId);
                                }
                            }
                        }
                    }
                }
            }

            // Already inside a parent: when the outer seam miss leaves gap null,
            // claim after-last on that parent's pad (short nest pad / overshoot).
            // Do NOT override an existing gap aim — that stole Tab1→after Section3
            // into Section3→after Notes once the drag had crossed Section3.
            if (gapSiblingId === null && activeParentNameEarly !== null) {
                const parentGroupField = ordered.find(
                    (field) =>
                        field.name === activeParentNameEarly &&
                        isLayoutGroupType(field.type),
                );
                const keepInsideLast =
                    parentGroupField !== undefined
                        ? lastDirectChildIdForInsideParentPad(
                              pointerForOver,
                              parentGroupField.id,
                              activeFieldIdNumber,
                          )
                        : null;

                if (keepInsideLast !== null) {
                    gapSiblingId = keepInsideLast;
                }
            }

            // Pointer in ancestor pad below a nested group (outside that group's
            // chrome): unnest to after the nested group in the ancestor — not
            // after-last inside the nested group (Notes under Section3).
            if (pointerForOver !== null && activeParentNameEarly !== null) {
                const nestedParentField = ordered.find(
                    (field) =>
                        field.name === activeParentNameEarly &&
                        isLayoutGroupType(field.type),
                );
                if (nestedParentField !== undefined) {
                    const nestedChrome = document.querySelector(
                        `[data-group-field-id="${nestedParentField.id}"]`,
                    );
                    const nestedRect =
                        nestedChrome instanceof HTMLElement
                            ? nestedChrome.getBoundingClientRect()
                            : null;
                    const ancestorName =
                        nestedParentField !== undefined
                            ? (fieldGroupsRef.current.get(
                                  nestedParentField.id,
                              ) ?? getFieldGroupName(nestedParentField))
                            : null;
                    const ancestorField =
                        ancestorName !== null
                            ? ordered.find(
                                  (field) =>
                                      field.name === ancestorName &&
                                      isLayoutGroupType(field.type),
                              )
                            : undefined;

                    if (
                        nestedRect !== null &&
                        ancestorField !== undefined &&
                        pointerForOver.y > nestedRect.bottom - 2 &&
                        pointerInsideGroupChrome(
                            pointerForOver,
                            ancestorField.id,
                        )
                    ) {
                        const ancestorAfter =
                            lastDirectChildIdForInsideParentPad(
                                pointerForOver,
                                ancestorField.id,
                                activeFieldIdNumber,
                            );

                        if (ancestorAfter !== null) {
                            gapSiblingId = ancestorAfter;
                        }
                    }
                }
            }

            if (gapSiblingId !== null) {
                underId = gapSiblingId;
                // Gap = sibling insert. Clear sticky nest + set pending to the
                // aimed sibling's parent so dragEnd cannot commit into-group
                // (or unnest via pending=null) from a prior pad / SoT lag.
                if (dropLayoutIntentRef.current === 'into-group') {
                    dropLayoutIntentRef.current = null;
                    setDropLayoutIntent(null);
                }
                const gapField = ordered.find((f) => f.id === gapSiblingId);
                pendingActiveGroupRef.current = gapField
                    ? (fieldGroupsRef.current.get(gapField.id) ??
                      getFieldGroupName(gapField))
                    : null;
                // Provisional: insert before the gap-aim sibling; path below
                // refines before/after from pointer geometry.
                pendingBeforeSiblingRef.current = gapSiblingId;
            } else if (
                // Sticky nest (Directus): stay in the current group while the pointer
                // remains on empty pad / nest body / that group's header. Exit when
                // aiming at another field or another group's nest (unnest / retarget).
                dropLayoutIntentRef.current === 'into-group' &&
                dropTargetFieldIdRef.current !== null &&
                pointerInsideGroupChrome(
                    pointerForOver,
                    dropTargetFieldIdRef.current,
                )
            ) {
                const stickyId = dropTargetFieldIdRef.current;
                const rawUnder = droppableIdUnderPointer(
                    pointerForOver,
                    activeFieldIdNumber,
                );
                const rawNest = rawUnder !== null ? parseGroupDropId(rawUnder) : null;
                const rawFieldId =
                    rawUnder !== null && rawNest === null
                        ? Number(rawUnder)
                        : NaN;

                if (rawNest !== null && rawNest !== stickyId) {
                    underId = rawUnder;
                } else if (
                    Number.isFinite(rawFieldId) &&
                    rawFieldId !== stickyId
                ) {
                    const rawField = ordered.find((f) => f.id === rawFieldId);
                    const rawParent =
                        fieldGroupsRef.current.get(rawFieldId) ??
                        (rawField ? getFieldGroupName(rawField) : null);
                    const stickyField = ordered.find((f) => f.id === stickyId);
                    const stickyName = stickyField?.name ?? null;

                    if (rawParent !== stickyName) {
                        underId = rawUnder;
                    } else {
                        underId = groupDropId(stickyId);
                    }
                } else {
                    underId = groupDropId(stickyId);
                }
            }

            if (underId !== null) {
                const underNest = parseGroupDropId(underId);

                if (underNest !== null) {
                    nestGroupId = underNest;
                    overFieldId = underNest;
                    overField = undefined;
                } else {
                    nestGroupId = null;
                    overFieldId = Number(underId);
                    overField = ordered.find((f) => f.id === overFieldId);
                }
            }
        }

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

                // Already a member: reorder among siblings inside; don't treat the
                // group's own header as "unnest to sibling of parent" (oscillation).
                if (alreadyInside) {
                    const pointer =
                        getWindowDragPointer() ?? latestCollisionPointer;
                    // After last direct child (short nest pad / slight overshoot)
                    // beats nested Notes hits and outer unnest seams.
                    const afterLastId =
                        pointer !== null
                            ? lastDirectChildIdForInsideParentPad(
                                  pointer,
                                  nestGroupId,
                                  activeFieldIdNumber,
                              )
                            : null;
                    // Between two sibling cells inside this parent → sibling aim,
                    // not the bottom nest pad (live gap vs ghost SoT mismatch).
                    const innerSeamId =
                        afterLastId === null && pointer !== null
                            ? siblingIdInTreeGap(pointer, activeFieldIdNumber)
                            : afterLastId;

                    if (innerSeamId !== null) {
                        if (dropLayoutIntentRef.current === 'into-group') {
                            dropLayoutIntentRef.current = null;
                            setDropLayoutIntent(null);
                        }

                        overFieldId = innerSeamId;
                        overField = ordered.find((f) => f.id === overFieldId);

                        if (!overField) {
                            return;
                        }
                    } else {
                        const directIds = new Set(
                            directChildCellsInGroupBody(
                                nestGroupId,
                                activeFieldIdNumber,
                            ).map((cell) => cell.id),
                        );
                        const hits =
                            pointer !== null
                                ? document.elementsFromPoint(
                                      pointer.x,
                                      pointer.y,
                                  )
                                : [];
                        let remappedId = NaN;

                        for (const hit of hits) {
                            if (!(hit instanceof Element)) {
                                continue;
                            }

                            if (hit.closest('[data-dnd-field-overlay]')) {
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
                                id !== activeFieldIdNumber &&
                                id !== nestGroupId &&
                                directIds.has(id)
                            ) {
                                remappedId = id;
                                break;
                            }
                        }

                        if (!Number.isFinite(remappedId)) {
                            // Already inside this group: empty nest pad is NOT
                            // nest-into-self (that parked the ghost at the parent
                            // bottom). Prefer nearest *direct* sibling.
                            if (pointer !== null) {
                                let nearest: {
                                    id: number;
                                    dist: number;
                                } | null = null;

                                for (const cell of directChildCellsInGroupBody(
                                    nestGroupId,
                                    activeFieldIdNumber,
                                )) {
                                    const dist = Math.hypot(
                                        pointer.x -
                                            (cell.left +
                                                (cell.right - cell.left) / 2),
                                        pointer.y -
                                            (cell.top +
                                                (cell.bottom - cell.top) / 2),
                                    );

                                    if (
                                        nearest === null ||
                                        dist < nearest.dist
                                    ) {
                                        nearest = { id: cell.id, dist };
                                    }
                                }

                                remappedId = nearest?.id ?? NaN;
                            }
                        }

                        if (!Number.isFinite(remappedId)) {
                            return;
                        }

                        if (dropLayoutIntentRef.current === 'into-group') {
                            dropLayoutIntentRef.current = null;
                            setDropLayoutIntent(null);
                        }

                        overFieldId = remappedId;
                        overField = ordered.find((f) => f.id === overFieldId);

                        if (!overField) {
                            return;
                        }
                    }
                } else {
                    const nestPointer =
                        getWindowDragPointer() ?? latestCollisionPointer;

                    // Inner sibling seam beats sticky nest / deep-body into-group.
                    const innerSeamId =
                        nestPointer !== null
                            ? siblingIdInTreeGap(
                                  nestPointer,
                                  activeFieldIdNumber,
                              )
                            : null;

                    if (innerSeamId !== null) {
                        if (dropLayoutIntentRef.current === 'into-group') {
                            dropLayoutIntentRef.current = null;
                            setDropLayoutIntent(null);
                        }

                        overFieldId = innerSeamId;
                        overField = ordered.find((f) => f.id === overFieldId);

                        if (!overField) {
                            return;
                        }
                    } else {
                        // Sticky nest (Directus): once into-group for this chrome,
                        // stay until the pointer leaves the whole group container.
                        // Same-parent sibling reorder: exit sticky nest on the
                        // wide insert edge so Category can leave Section3.
                        const nestGroupParent =
                            fieldGroupsRef.current.get(nestGroupId) ??
                            getFieldGroupName(groupField);
                        const sameParentAsNest =
                            activeParent !== null &&
                            nestGroupParent !== null &&
                            activeParent === nestGroupParent;
                        if (
                            nestPointer !== null &&
                            dropLayoutIntentRef.current === 'into-group' &&
                            dropTargetFieldIdRef.current === nestGroupId &&
                            pointerInsideGroupChrome(nestPointer, nestGroupId) &&
                            !(
                                sameParentAsNest &&
                                isPointerOnGroupInsertEdge(
                                    nestPointer,
                                    nestGroupId,
                                    true,
                                )
                            )
                        ) {
                            previewNestIntoGroup(activeFieldRow, groupField);
                            return;
                        }

                        const headerEl = document.querySelector(
                            `[data-sortable-id="${nestGroupId}"]`,
                        );
                        const onHeader =
                            nestPointer !== null &&
                            headerEl instanceof HTMLElement &&
                            (() => {
                                const r = headerEl.getBoundingClientRect();

                                return (
                                    nestPointer.x >= r.left &&
                                    nestPointer.x <= r.right &&
                                    nestPointer.y >= r.top &&
                                    nestPointer.y <= r.bottom
                                );
                            })();
                        // Header (sibling of group) only — nest when in body mid.
                        // Shallow edges stay sibling-of-group so seams between
                        // groups don't flicker into into-group.
                        const groupParentName =
                            fieldGroupsRef.current.get(nestGroupId) ??
                            getFieldGroupName(groupField);
                        const sameParentSiblingReorder =
                            activeParent !== null &&
                            groupParentName !== null &&
                            activeParent === groupParentName;
                        const onInsertEdge =
                            nestPointer !== null &&
                            isPointerOnGroupInsertEdge(
                                nestPointer,
                                nestGroupId,
                                sameParentSiblingReorder,
                            );
                        const onDeepNest =
                            nestPointer !== null &&
                            !onInsertEdge &&
                            (() => {
                                const body = document.querySelector(
                                    `[data-group-drop="${nestGroupId}"]`,
                                );

                                if (!(body instanceof HTMLElement)) {
                                    return false;
                                }

                                const rect = body.getBoundingClientRect();
                                // Short bodies (empty / one child): keep a real
                                // deep zone — large % margins ate the whole pad.
                                // Same-parent sibling reorder: tighter deep zone
                                // so Category past Section3 stays after/before.
                                const margin = sameParentSiblingReorder
                                    ? Math.min(
                                          48,
                                          Math.max(28, rect.height * 0.32),
                                      )
                                    : Math.min(
                                          16,
                                          Math.max(8, rect.height * 0.12),
                                      );

                                return (
                                    nestPointer.x >= rect.left &&
                                    nestPointer.x <= rect.right &&
                                    nestPointer.y >= rect.top + margin &&
                                    nestPointer.y <= rect.bottom - margin
                                );
                            })();

                        // Header or shallow edge → sibling before/after this group.
                        // Deep body → nest-into preview (pending only, no live-append).
                        if (
                            !onHeader &&
                            onDeepNest &&
                            previewNestIntoGroup(activeFieldRow, groupField)
                        ) {
                            return;
                        }

                        overFieldId = nestGroupId;
                        overField = groupField;
                    }
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

        // Occupied-insert sticky: after live splice the pair FLIPs under the
        // pointer; collision often jumps to the displaced trailing half and
        // clears beside. Hold the insert target while the pointer stays on the
        // new pair row.
        const occupiedSticky = stickyBesideRef.current;

        if (
            zonePointer !== null &&
            occupiedSticky !== null &&
            occupiedSticky.activeId === activeFieldIdNumber &&
            occupiedSticky.occupiedInsert != null &&
            occupiedSticky.intent === 'before'
        ) {
            const stickyOverEl = document.querySelector(
                `[data-sortable-id="${occupiedSticky.overId}"]`,
            );
            const stickyActiveEl = document.querySelector(
                `[data-sortable-id="${occupiedSticky.activeId}"]`,
            );

            if (
                stickyOverEl instanceof HTMLElement &&
                stickyActiveEl instanceof HTMLElement
            ) {
                const overR = stickyOverEl.getBoundingClientRect();
                const activeR = stickyActiveEl.getBoundingClientRect();
                const rowTop = Math.min(overR.top, activeR.top);
                const rowBottom = Math.max(overR.bottom, activeR.bottom);
                const rowLeft = Math.min(overR.left, activeR.left);
                const rowRight = Math.max(overR.right, activeR.right);
                const inPairRow =
                    zonePointer.x >= rowLeft - 12 &&
                    zonePointer.x <= rowRight + 12 &&
                    zonePointer.y >= rowTop - 10 &&
                    zonePointer.y <= rowBottom + 10;

                if (inPairRow && !isHoldingStackBelowBand(zonePointer)) {
                    const stickyOverField = ordered.find(
                        (field) => field.id === occupiedSticky.overId,
                    );

                    if (stickyOverField) {
                        overFieldId = occupiedSticky.overId;
                        overField = stickyOverField;
                        dropTargetFieldIdRef.current = occupiedSticky.overId;
                        setDropTargetFieldId(occupiedSticky.overId);
                        setDropIntent('before');
                        dropIntentRef.current = 'before';
                        setDropLayoutIntent('beside');
                        dropLayoutIntentRef.current = 'beside';
                        commitRowBreakFieldIds(
                            rowBreakIdsForDropFrame(
                                rowBreakAtDragStartRef.current,
                                activeFieldIdNumber,
                                occupiedSticky.overId,
                                'beside',
                                'before',
                                false,
                                false,
                                occupiedSticky.occupiedInsert,
                            ),
                        );

                        return;
                    }
                }
            }
        }

        if (
            zonePointer !== null &&
            getFieldLayoutWidth(activeFieldRow.settings) === 'half'
        ) {
            // Empty-partner column under pointer wins over collision overId
            // (stacked halves: aiming middle partner must not stick to top).
            const partnerId =
                partnerUnderPointer ??
                openPartnerFieldIdUnderPointer(
                    zonePointer,
                    activeFieldIdNumber,
                );

            if (partnerId !== null && partnerId !== overFieldId) {
                const partnerField = ordered.find(
                    (field) => field.id === partnerId,
                );

                if (partnerField) {
                    overFieldId = partnerId;
                    overField = partnerField;
                }
            } else {
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

            // Occupied pair: prefer the half card under the pointer (leading
            // right-edge must not remap to the trailing partner).
            const layoutForRemap = hasGroups
                ? siblingFieldsForLayout(
                      getFieldsWithOverrides(),
                      fieldGroupsRef.current.get(overFieldId) ??
                          getFieldGroupName(overField),
                      rowBreakFieldIdsRef.current,
                  )
                : fieldsWithRowBreakOverrides(
                      ordered,
                      rowBreakFieldIdsRef.current,
                  );
            const remappedLeading = remapOccupiedPairOverFromPointer(
                layoutForRemap,
                overFieldId,
                zonePointer,
                activeFieldIdNumber,
            );

            if (remappedLeading !== null && remappedLeading !== overFieldId) {
                const leadingField = ordered.find(
                    (field) => field.id === remappedLeading,
                );

                if (leadingField) {
                    overFieldId = remappedLeading;
                    overField = leadingField;
                }
            }
        }

        // Open-partner beside must run before nest-permission early returns —
        // a stale below-new-row otherwise sticks when canNest aborts the frame.
        const intentPointer = getWindowDragPointer() ?? latestCollisionPointer;
        const liveOverRectEarly = liveDropIntentRect(
            overFieldId,
            intentPointer,
        );
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

        // Adjacent live partners → swap/stack, never empty-column beside.
        const layoutFieldsEarly = hasGroups
            ? siblingFieldsForLayout(
                  getFieldsWithOverrides(),
                  fieldGroupsRef.current.get(overFieldId) ??
                      getFieldGroupName(overField),
                  rowBreakFieldIdsRef.current,
              )
            : fieldsWithRowBreakOverrides(
                  ordered,
                  rowBreakFieldIdsRef.current,
              );
        const earlyActiveIdx = layoutFieldsEarly.findIndex(
            (field) => field.id === activeFieldIdNumber,
        );
        const earlyOverIdx = layoutFieldsEarly.findIndex(
            (field) => field.id === overFieldId,
        );
        // Packing SoT — adjacent halves after a completed pair (Priority|Notes)
        // are NOT live partners; only occupiedHalfPairPartner counts.
        const earlyOccupiedOver =
            earlyOverIdx !== -1
                ? occupiedHalfPairPartner(layoutFieldsEarly, earlyOverIdx)
                : null;
        const livePairedHalves =
            earlyActiveIdx !== -1 &&
            earlyOccupiedOver !== null &&
            earlyOccupiedOver.partnerIndex === earlyActiveIdx;

        if (openBesideEarly && !livePairedHalves) {
            const besideOver = ordered.find((field) => field.id === overFieldId);

            if (
                besideOver &&
                getFieldLayoutWidth(besideOver.settings) === 'half' &&
                !isHoldingStackBelowBand(earlyPtr)
            ) {
                commitBesideAfter(activeFieldIdNumber, overFieldId, besideOver);

                return;
            }
        }

        // Sticky beside surviving packing: treat live pair of sticky target as
        // still-beside, not invert-swap (empty column already filled by active).
        if (
            livePairedHalves &&
            stickyBesideRef.current?.activeId === activeFieldIdNumber &&
            stickyBesideRef.current.overId === overFieldId
        ) {
            const stickyOverField = ordered.find(
                (field) => field.id === overFieldId,
            );

            if (stickyOverField) {
                const { overRect: keepRect, emptyRect: keepEmpty } =
                    measureHalfPartnerGeometry(overFieldId);

                if (
                    shouldKeepStickyBeside(
                        stickyBesideRef.current,
                        activeFieldIdNumber,
                        earlyPtr,
                        keepRect,
                        keepEmpty,
                        partnerUnderPointer ??
                            (earlyPtr !== null
                                ? openPartnerFieldIdUnderPointer(
                                      earlyPtr,
                                      activeFieldIdNumber,
                                  )
                                : null),
                    )
                ) {
                    const sticky = stickyBesideRef.current;

                    // Occupied insert-before: do not commitBesideAfter (would
                    // flip active to the right seat and drop the leading break).
                    if (
                        sticky.intent === 'before' &&
                        sticky.occupiedInsert != null
                    ) {
                        dropTargetFieldIdRef.current = overFieldId;
                        setDropTargetFieldId(overFieldId);
                        setDropIntent('before');
                        dropIntentRef.current = 'before';
                        setDropLayoutIntent('beside');
                        dropLayoutIntentRef.current = 'beside';
                        commitRowBreakFieldIds(
                            rowBreakIdsForDropFrame(
                                rowBreakAtDragStartRef.current,
                                activeFieldIdNumber,
                                overFieldId,
                                'beside',
                                'before',
                                false,
                                false,
                                sticky.occupiedInsert,
                            ),
                        );

                        return;
                    }

                    commitBesideAfter(
                        activeFieldIdNumber,
                        overFieldId,
                        stickyOverField,
                    );

                    return;
                }
            }
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
            orderAtDragStartRef.current,
        );

        // DOM SoT for paired stack-below (open-partner beside handled above).
        // Keep this band deep — mid-card must remain left↔right swap (Directus).
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
            intentResult.layoutIntent !== 'beside' &&
            getFieldLayoutWidth(activeFieldRow.settings) === 'half' &&
            getFieldLayoutWidth(overField.settings) === 'half' &&
            liveOverRect !== null &&
            !overHasOpenPartnerDom
        ) {
            const bandY = liveOverRect.top + liveOverRect.height * 0.82;
            const hitX = earlyPtr?.x ?? null;
            const inHorizontalBand =
                hitX === null ||
                (hitX >= liveOverRect.left + liveOverRect.width * 0.12 &&
                    hitX <= liveOverRect.left + liveOverRect.width * 0.88);

            // Pointer only — overlay-bottom inflation stole the swap surface.
            if (inHorizontalBand && hitY !== null && hitY >= bandY) {
                intentResult = {
                    ...intentResult,
                    intent: 'after',
                    layoutIntent: 'below-new-row',
                };
            }
        }

        if (intentResult !== null) {
            // Stack-below an occupied leading half must land *after the trailing
            // partner* — inserting after the leading half splits the pair
            // (C|D + stack B → C, B, D all alone).
            if (
                intentResult.layoutIntent === 'below-new-row' &&
                getFieldLayoutWidth(activeFieldRow.settings) === 'half' &&
                getFieldLayoutWidth(overField.settings) === 'half'
            ) {
                const overIdxStack = layoutFields.findIndex(
                    (field) => field.id === intentResult.overFieldId,
                );
                const occupiedStack =
                    overIdxStack !== -1
                        ? occupiedHalfPairPartner(layoutFields, overIdxStack)
                        : null;

                if (occupiedStack?.role === 'leading') {
                    const trailing = layoutFields[occupiedStack.partnerIndex];

                    if (trailing !== undefined) {
                        intentResult = {
                            ...intentResult,
                            overFieldId: trailing.id,
                            intent: 'after',
                        };
                        overFieldId = trailing.id;
                        overField = trailing;
                    }
                }
            }

            // Adjacent half partners must never stick as beside (empty-column)
            // unless sticky open-partner preview already packed active into the seat.
            const stickyPairedPreview =
                stickyBesideRef.current?.activeId === activeFieldIdNumber &&
                stickyBesideRef.current.overId === intentResult.overFieldId;

            if (
                livePairedHalves &&
                intentResult.layoutIntent === 'beside' &&
                !stickyPairedPreview
            ) {
                intentResult = {
                    ...intentResult,
                    layoutIntent: null,
                    intent:
                        earlyActiveIdx < earlyOverIdx ? 'after' : 'before',
                };
            }

            // Stack-below hold: don't let open-slot geometry flip back to beside.
            if (
                intentResult.layoutIntent === 'beside' &&
                isHoldingStackBelowBand(earlyPtr)
            ) {
                intentResult = {
                    ...intentResult,
                    intent: 'after',
                    layoutIntent: 'below-new-row',
                };
            }

            if (intentResult.layoutIntent === 'beside') {
                // Placeholder — refreshed below once occupiedInsert is known.
                stickyBesideRef.current = {
                    activeId: activeFieldIdNumber,
                    overId: intentResult.overFieldId,
                    intent: intentResult.intent,
                };
            } else if (
                stickyBesideRef.current?.activeId === activeFieldIdNumber &&
                intentResult.layoutIntent === 'below-new-row'
            ) {
                stickyBesideRef.current = null;
            }

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

            // Occupied-pair insert: new leading must keep a row-break so a prior
            // open half above cannot absorb the dragged field.
            let occupiedInsert: OccupiedHalfInsert | null = null;

            if (
                intentResult.layoutIntent === 'beside' &&
                activeLayoutWidth === 'half' &&
                overLayoutWidth === 'half'
            ) {
                const overIdxForOcc = layoutFields.findIndex(
                    (field) => field.id === intentResult.overFieldId,
                );
                const occupied =
                    overIdxForOcc !== -1
                        ? occupiedHalfPairPartner(layoutFields, overIdxForOcc)
                        : null;
                const activeIdxForOcc = layoutFields.findIndex(
                    (field) => field.id === activeFieldIdNumber,
                );
                const activeIsPairMate =
                    occupied !== null &&
                    activeIdxForOcc !== -1 &&
                    activeIdxForOcc === occupied.partnerIndex;

                if (occupied !== null && !activeIsPairMate) {
                    occupiedInsert = {
                        newLeadingId:
                            occupied.role === 'leading' &&
                            resolvedIntent === 'before'
                                ? activeFieldIdNumber
                                : occupied.role === 'trailing'
                                  ? layoutFields[occupied.partnerIndex]!.id
                                  : activeFieldIdNumber,
                    };
                }
            }

            if (intentResult.layoutIntent === 'beside') {
                stickyBesideRef.current = {
                    activeId: activeFieldIdNumber,
                    overId: intentResult.overFieldId,
                    intent: resolvedIntent,
                    occupiedInsert,
                };
            }

            // Always re-derive from drag-start so a prior beside hover cannot
            // leave cleared breaks on unrelated stacked halves.
            commitRowBreakFieldIds(
                rowBreakIdsForDropFrame(
                    rowBreakAtDragStartRef.current,
                    activeFieldIdNumber,
                    intentResult.overFieldId,
                    intentResult.layoutIntent,
                    resolvedIntent,
                    forceHalfRowBreak,
                    livePairedHalves,
                    occupiedInsert,
                ),
            );

            if (hasGroups) {
                pendingBeforeSiblingRef.current = beforeSiblingId;

                // Live-move sibling inserts including unnest/reparent so the
                // dashed ghost leaves the group and sits between the aim targets.
                // Nest-into stays preview-only (oscillation / max update depth).
                // Open-partner beside uses empty column + commitBesideAfter.
                // Occupied-pair beside must splice so the displaced partner wraps.
                if (
                    intentResult.layoutIntent !== 'beside' ||
                    occupiedInsert !== null
                ) {
                    applyLiveGroupMove(
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

        // Flat half↔half open-partner: keep ghost in empty column (no live move)
        // until stack-below or same-row swap intent. Swap/stack need live reorder
        // so siblings FLIP like Directus. Occupied-pair beside also live-moves
        // (insert displaces the trailing partner onto a new row).
        if (
            getFieldLayoutWidth(activeFieldRow.settings) === 'half' &&
            getFieldLayoutWidth(overField.settings) === 'half'
        ) {
            const overIdx = layoutFields.findIndex(
                (field) => field.id === overFieldId,
            );
            const openPartner =
                overIdx !== -1 &&
                halfFieldHasOpenPartnerSlot(
                    layoutFields,
                    layoutColSpans,
                    overIdx,
                );
            const layout = dropLayoutIntentRef.current;
            const allowLive =
                layout === 'below-new-row' ||
                (layout === 'beside' && !openPartner) ||
                (layout === null && !openPartner);

            if (!allowLive) {
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

        // Hold stack-below against open-partner re-grab: unpairing opens the
        // empty column under a past-bottom pointer, and beside would undo it.
        if (isHoldingStackBelowBand(pointer)) {
            return false;
        }

        // Pointer/DOM SoT first — retarget before sticky hysteresis can hold a
        // previous stacked half's partner while the ghost already shows another.
        const partnerUnderPointer = openPartnerFieldIdUnderPointer(
            pointer,
            activeId,
        );

        // Sticky only when still in the *same* partner zone (packing cleared
        // empty DOM). Different partner under pointer → fall through to commit.
        const sticky = stickyBesideRef.current;

        if (
            sticky !== null &&
            sticky.activeId === activeId &&
            (partnerUnderPointer === null ||
                partnerUnderPointer === sticky.overId)
        ) {
            const stickyOver = orderedFieldsRef.current.find(
                (field) => field.id === sticky.overId,
            );
            const { overRect, emptyRect } = measureHalfPartnerGeometry(
                sticky.overId,
            );

            if (
                stickyOver &&
                getFieldLayoutWidth(stickyOver.settings) === 'half' &&
                shouldKeepStickyBeside(
                    sticky,
                    activeId,
                    pointer,
                    overRect,
                    emptyRect,
                    partnerUnderPointer,
                )
            ) {
                commitBesideAfter(activeId, sticky.overId, stickyOver);

                return true;
            }

            if (
                pointerExitsStickyBesideForStack(pointer, overRect, emptyRect)
            ) {
                stickyBesideRef.current = null;
            }
        } else if (
            sticky !== null &&
            sticky.activeId === activeId &&
            partnerUnderPointer !== null &&
            partnerUnderPointer !== sticky.overId
        ) {
            stickyBesideRef.current = null;
        }

        const overFieldId = partnerUnderPointer;

        if (overFieldId === null) {
            return false;
        }

        // Past this partner's row bottom → stack-below owns the pointer.
        // Otherwise a one-frame unpair opens the empty column and beside
        // immediately re-grabs (stackBelow thrash).
        const { overRect, emptyRect } = measureHalfPartnerGeometry(overFieldId);

        if (pointerExitsStickyBesideForStack(pointer, overRect, emptyRect)) {
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

        // Still packing as this half's partner → swap, not beside — unless
        // sticky already chose this over (preview packing filled the seat).
        const parentGroup =
            fieldGroupsRef.current.get(overFieldId) ??
            getFieldGroupName(overField);
        const layoutSiblings = hasGroups
            ? siblingFieldsForLayout(
                  getFieldsWithOverrides(),
                  parentGroup,
                  rowBreakFieldIdsRef.current,
              )
            : fieldsWithRowBreakOverrides(
                  orderedFieldsRef.current,
                  rowBreakFieldIdsRef.current,
              );
        const activeIdx = layoutSiblings.findIndex(
            (field) => field.id === activeId,
        );
        const overIdx = layoutSiblings.findIndex(
            (field) => field.id === overFieldId,
        );
        const stickyMatches =
            stickyBesideRef.current?.activeId === activeId &&
            stickyBesideRef.current.overId === overFieldId;
        const occupiedOver =
            overIdx !== -1
                ? occupiedHalfPairPartner(layoutSiblings, overIdx)
                : null;

        // True packed pair only — adjacent after a completed pair (Notes under
        // abvl|Priority) must still allow empty-column beside.
        if (
            !stickyMatches &&
            occupiedOver !== null &&
            occupiedOver.partnerIndex === activeIdx
        ) {
            return false;
        }

        commitBesideAfter(activeId, overFieldId, overField);

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
        // Do not flush a trailing hover on release — the last committed dragOver
        // is SoT. Flushing often rewrites into-group to a group under the
        // pointer at mouseup (ghost≠drop).
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
        // (e.g. quick flick). Never clobber a live sibling preview — and never
        // invent into-group from release `over` after a live reorder (that
        // nested the field while the ghost still sat between roots).
        const liveOrderChanged =
            activeId !== null &&
            orderedFieldsRef.current.map((field) => field.id).join(',') !==
                orderAtDragStartRef.current.join(',');

        if (
            activeId !== null &&
            over !== null &&
            pendingGroup === undefined &&
            !liveOrderChanged
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
        setGhostHeight(undefined);
        setGroupGhostHtml(null);
        const releaseOverFieldId = dropTargetFieldIdRef.current;
        const finalLayoutIntent = dropLayoutIntentRef.current;
        const finalIntent = intentForLayoutDrop(
            dropIntentRef.current ?? 'after',
            finalLayoutIntent,
        );
        dropTargetFieldIdRef.current = null;
        setDropTargetFieldId(null);
        setDropIntent(null);
        dropIntentRef.current = null;
        setDropLayoutIntent(null);
        dropLayoutIntentRef.current = null;
        stickyBesideRef.current = null;
        pendingActiveGroupRef.current = undefined;
        pendingBeforeSiblingRef.current = null;

        // pending* from last hover are SoT — do not recompute from release `over`
        // (that made the dashed ghost disagree with the landed order).

        // Ensure half-row break from last dragOver is applied even if setState lagged.
        if (activeId !== null && finalLayoutIntent === 'beside') {
            const overIdForBreaks =
                releaseOverFieldId ??
                (over !== null && !parseGroupDropId(over.id)
                    ? Number(over.id)
                    : null);
            commitRowBreakFieldIds(
                rowBreakIdsForDropFrame(
                    rowBreakAtDragStartRef.current,
                    activeId,
                    overIdForBreaks,
                    'beside',
                    finalIntent,
                    false,
                    false,
                ),
            );
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

            if (forceBreak) {
                commitRowBreakFieldIds(
                    rowBreakIdsForDropFrame(
                        rowBreakAtDragStartRef.current,
                        activeId,
                        releaseOverFieldId,
                        finalLayoutIntent === 'below-new-row'
                            ? 'below-new-row'
                            : null,
                        finalIntent,
                        true,
                        false,
                    ),
                );
            }
            // Else keep live dragOver row-break overrides (already derived from
            // drag-start each frame). Re-applying drag-start after a paired
            // half↔half swap would restore breaks and stack the pair.
        }

        let nextFields = orderedFieldsRef.current;
        let nextGroups = fieldGroupsRef.current;

        if (hasGroups && activeId !== null && pendingGroup !== undefined) {
            // Live dragOver already applied sibling inserts (incl. reparent into
            // a tabs/accordion body). Re-applying release `pending` undoes that
            // for sibling/beside paths — trust the live tree there.
            // into-group is preview-only during drag (never live-nested), so the
            // ghost SoT in pending* must always commit on drop even if an earlier
            // frame live-reparented the leaf (e.g. under a parent tab while aiming
            // a child section body). Skipping nest when liveGroupsChanged left the
            // field as a sibling under that live parent while the ghost still
            // showed into-group.
            const startGroups = groupsAtDragStartRef.current;
            const liveGroupsChanged =
                nextGroups.size !== startGroups.size ||
                Array.from(nextGroups.entries()).some(
                    ([id, group]) => startGroups.get(id) !== group,
                );
            const trustLive =
                finalLayoutIntent !== 'into-group' &&
                (liveOrderChanged || liveGroupsChanged);

            if (!trustLive) {
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

                const withGroups = fieldsWithGroupOverrides(
                    nextFields,
                    nextGroups,
                );
                const nextTree = buildFieldTree(withGroups);
                fieldTreeRef.current = nextTree;
                setFieldTree(nextTree);
            }
        } else if (!hasGroups && activeId !== null) {
            // Ghost/dropTarget SoT — never clobber with release `over` (sticky
            // retarget can leave collision on the previous stacked half).
            const dropOverId =
                releaseOverFieldId ??
                (over !== null && !parseGroupDropId(over.id)
                    ? Number(over.id)
                    : null);

            if (dropOverId !== null) {
                const overIndex = nextFields.findIndex(
                    (field) => field.id === dropOverId,
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
                        nextFields = arrayMove(
                            nextFields,
                            oldIndex,
                            targetIndex,
                        );
                        orderedFieldsRef.current = nextFields;
                        overridesCacheRef.current = null;
                        setOrderedFields(nextFields);
                    }
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
        setGhostHeight(undefined);
        setGroupGhostHtml(null);
        dropTargetFieldIdRef.current = null;
        setDropTargetFieldId(null);
        setDropIntent(null);
        setDropLayoutIntent(null);
        dropLayoutIntentRef.current = null;
        stickyBesideRef.current = null;
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
                    <div className={cn('grid grid-cols-1 md:grid-cols-2', FIELD_LIST_GAP_CLASS)}>
                        {fieldsForLayout.map((field, fieldIndex) => {
                            const forceNewRow =
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

                            return (
                                <SortableCollectionFieldRow
                                    key={field.id}
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
                                    listDragging={listDragging}
                                    suppressGhostSlot={
                                        activeFieldId === field.id &&
                                        (dropLayoutIntent === 'beside' ||
                                            dropLayoutIntent ===
                                                'into-group')
                                    }
                                    forceNewRow={forceNewRow}
                                />
                            );
                        })}
                    </div>
                </SortableContext>
            )}

            <DragOverlay dropAnimation={fieldDragOverlayAnimation}>
                {activeField !== null ? (
                    groupGhostHtml !== null ? (
                        // ponytail: DOM snapshot of full group chrome (header + body);
                        // ceiling = static mid-drag (Directus fallback is a clone too).
                        <div
                            data-dnd-field-overlay
                            className="pointer-events-none overflow-hidden"
                            style={{
                                width:
                                    ghostWidth && ghostWidth > 0
                                        ? ghostWidth
                                        : undefined,
                                height:
                                    ghostHeight && ghostHeight > 0
                                        ? ghostHeight
                                        : undefined,
                                opacity: 0.85,
                                cursor: 'grabbing',
                            }}
                            dangerouslySetInnerHTML={{ __html: groupGhostHtml }}
                        />
                    ) : (
                        <div
                            data-dnd-field-overlay
                            style={{
                                width:
                                    ghostWidth && ghostWidth > 0
                                        ? ghostWidth
                                        : undefined,
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
                    )
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
