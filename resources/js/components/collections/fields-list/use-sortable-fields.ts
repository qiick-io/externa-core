import { router } from '@inertiajs/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Sortable from 'sortablejs';
import type { MoveEvent } from 'sortablejs';
import FieldLayoutController from '@/actions/App/Http/Controllers/Collections/FieldLayoutController';
import {
    clientPointFromEvent,
    fieldsWithRowBreakOverrides,
    findOverflowScrollParent,
    groupsMapFromFields,
    parentGroupFromList,
    readDomFieldOrder,
    restoreFieldDomToStart,
    rowBreakFieldIdsFromFields,
} from '@/components/collections/fields-list/field-list-layout';
import type { SortableEndEvent } from '@/components/collections/fields-list/field-list-layout';
import { resolveFieldDropCommit } from '@/components/collections/fields-list/resolve-field-drop';
import type {
    FieldDragLastMove,
    FieldDragStart,
} from '@/components/collections/fields-list/resolve-field-drop';
import {
    buildFieldTree,
    canNestFieldIntoGroup,
    fieldsWithGroupOverrides,
    getFieldGroupName,
    isLayoutGroupType,
    wouldCreateGroupCycle,
} from '@/lib/collection-field-groups';
import type { CollectionFieldRow } from '@/types';

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

/**
 * Drag-and-drop state of the collection fields board.
 *
 * Mounts one Sortable per `[data-field-list]` under `rootRef`, keeps a local
 * order / row-break / group copy of `fields` while dragging, restores the
 * Sortable-mutated DOM before React reconciles, and posts the new layout to
 * FieldLayoutController.reorder. Escape cancels a drag; a drop off the board
 * commits nothing.
 */
export function useSortableFields(
    collectionId: number,
    fields: CollectionFieldRow[],
    rootRef: RefObject<HTMLDivElement | null>,
) {
    const draggingRef = useRef(false);
    const orderedFieldsRef = useRef(fields);
    const rowBreakFieldIdsRef = useRef(rowBreakFieldIdsFromFields(fields));
    const fieldGroupsRef = useRef(groupsMapFromFields(fields));
    const dragStartRef = useRef<FieldDragStart>({
        orderIds: fields.map((field) => field.id),
        rowBreakIds: Array.from(rowBreakFieldIdsFromFields(fields)),
        groups: groupsMapFromFields(fields),
    });
    // Sortable onEnd omits MoveEvent.related — keep last onMove target + pointer.
    const lastMoveRef = useRef<FieldDragLastMove | null>(null);
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

            const start = dragStartRef.current;
            const nextBreaks = resolveFieldDropCommit({
                evt,
                rootList,
                groups,
                nextFields,
                byId,
                start,
                move: lastMoveRef.current,
            });

            if (nextBreaks === null) {
                finishWithoutCommit();

                return;
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
                FieldLayoutController.reorder.url(collectionId),
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
        // rootRef is the caller's stable ref object; listing it never re-runs the effect.
    }, [collectionId, rootRef, treeSignature, sortableEpoch]);

    return {
        orderedFields,
        rowBreakFieldIds,
        fieldsForTree,
        hasGroups,
        fieldTree,
    };
}
