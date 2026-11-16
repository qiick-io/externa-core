import { router } from '@inertiajs/react';
import { useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { createSortableList } from '@/lib/create-sortable-list';
import { currentPathWithQuery } from '@/lib/safe-return-url';
import { applyCardMove } from './use-kanban-columns';
import type { ColumnState } from './use-kanban-columns';

/**
 * Put Sortable-moved cards back under pre-drag parents/order so React can
 * reconcile without removeChild NotFoundError, then setState to the new board.
 */
function restoreKanbanDom(
    boardEl: HTMLElement,
    columns: readonly ColumnState[],
): void {
    const cards = new Map<number, HTMLElement>();

    for (const card of boardEl.querySelectorAll('[data-kanban-card]')) {
        if (!(card instanceof HTMLElement)) {
            continue;
        }

        const id = Number(card.dataset.itemId);

        if (Number.isFinite(id)) {
            cards.set(id, card);
        }
    }

    for (const column of columns) {
        const list = boardEl.querySelector(
            `[data-kanban-column][data-column-value="${CSS.escape(column.value)}"]`,
        );

        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (
                child instanceof HTMLElement &&
                child.hasAttribute('data-kanban-card')
            ) {
                child.remove();
            }
        }

        const sentinel = list.querySelector('[data-kanban-sentinel]');

        for (const item of column.items) {
            const card = cards.get(item.id);

            if (!card) {
                continue;
            }

            if (sentinel) {
                list.insertBefore(card, sentinel);
            } else {
                list.appendChild(card);
            }
        }
    }
}

type UseKanbanDragOptions = {
    /** The board element whose `[data-kanban-column]` lists become sortable. */
    boardRef: RefObject<HTMLDivElement | null>;
    collectionId: number;
    /** Inertia's `collection.versioning`, so a server change remounts Sortable. */
    collectionVersioning: boolean | undefined;
    canEdit: boolean;
    isTrashed: boolean;
    /** Kanban field, null when the collection has none. */
    fieldName: string | null;
    /** Latest columns, read at drop time without re-running the effect. */
    columnsRef: RefObject<ColumnState[]>;
    setColumns: Dispatch<SetStateAction<ColumnState[]>>;
    bumpSortableEpoch: () => void;
    /** Column values joined, so a column set change remounts Sortable. */
    columnLayoutKey: string;
    sortableEpoch: number;
};

/**
 * Drag and drop of the kanban cards.
 *
 * One Sortable instance per column. The move is persisted only in `onEnd`: the
 * instances are destroyed and the DOM restored to its pre-drag order first, so
 * React can reconcile, then the epoch bump remounts Sortable on the React-owned
 * tree and the item is saved through ItemController.update.
 */
export function useKanbanDrag({
    boardRef,
    collectionId,
    collectionVersioning,
    canEdit,
    isTrashed,
    fieldName,
    columnsRef,
    setColumns,
    bumpSortableEpoch,
    columnLayoutKey,
    sortableEpoch,
}: UseKanbanDragOptions): void {
    useEffect(() => {
        if (!boardRef.current || !canEdit || isTrashed || !fieldName) {
            return;
        }

        const boardEl = boardRef.current;
        const lists = Array.from(
            boardEl.querySelectorAll<HTMLElement>('[data-kanban-column]'),
        );
        const instances: ReturnType<typeof createSortableList>[] = [];

        const destroyAll = (): void => {
            for (const instance of instances) {
                instance.destroy();
            }

            instances.length = 0;
        };

        for (const list of lists) {
            instances.push(
                createSortableList(list, {
                    group: 'collection-kanban',
                    draggable: '[data-kanban-card]',
                    handle: '[data-kanban-handle]',
                    // Persist only onEnd — mid-drag setState remounts lists and
                    // races Sortable DOM (removeChild NotFoundError).
                    onEnd: (event) => {
                        const itemId = Number(
                            (event.item as HTMLElement).dataset.itemId,
                        );
                        const fromValue =
                            (event.from as HTMLElement).dataset.columnValue ??
                            '';
                        const nextValue =
                            (event.to as HTMLElement).dataset.columnValue ?? '';
                        const newIndex =
                            typeof event.newIndex === 'number'
                                ? event.newIndex
                                : 0;

                        destroyAll();
                        restoreKanbanDom(boardEl, columnsRef.current);

                        if (!Number.isFinite(itemId) || fieldName === null) {
                            bumpSortableEpoch();

                            return;
                        }

                        const result = applyCardMove(columnsRef.current, {
                            itemId,
                            fromValue,
                            toValue: nextValue,
                            newIndex,
                        });

                        if (result === null) {
                            bumpSortableEpoch();

                            return;
                        }

                        setColumns(result.columns);
                        bumpSortableEpoch();

                        router.put(
                            ItemController.update.url({
                                collection: collectionId,
                                item: itemId,
                            }),
                            {
                                data: {
                                    [fieldName]:
                                        nextValue === '' ? null : nextValue,
                                },
                                board_move: true,
                                after_item_id: result.afterItemId,
                                before_item_id: result.beforeItemId,
                                save_action: 'stay',
                                return: currentPathWithQuery(),
                            },
                            { preserveScroll: true },
                        );
                    },
                }),
            );
        }

        return destroyAll;
        // collectionVersioning only remounts Sortable when the server flips it.
    }, [
        boardRef,
        bumpSortableEpoch,
        canEdit,
        collectionId,
        collectionVersioning,
        columnLayoutKey,
        columnsRef,
        fieldName,
        isTrashed,
        setColumns,
        sortableEpoch,
    ]);
}
