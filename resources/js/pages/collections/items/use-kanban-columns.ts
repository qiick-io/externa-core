import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import ItemBoardController from '@/actions/App/Http/Controllers/Collections/ItemBoardController';
import type { ItemRow } from '@/types';
import type { QueryParams } from '@/wayfinder';

export type KanbanColumnPage = {
    value: string;
    label: string;
    total: number;
    current_page: number;
    last_page: number;
    items: ItemRow[];
};

export type KanbanBoard = {
    field: string;
    per_page: number;
    columns: KanbanColumnPage[];
};

/** One board column plus the in-flight flag of its next page. */
export type ColumnState = KanbanColumnPage & {
    loading: boolean;
};

/** Body of `ItemBoardController.kanbanColumn`: one page of a kanban column. */
export type KanbanColumnPayload = {
    data?: ItemRow[];
    current_page?: number;
    last_page?: number;
    total?: number;
};

/** A completed drag: the card, where it came from and its index in the target. */
export type KanbanCardMove = {
    itemId: number;
    fromValue: string;
    toValue: string;
    newIndex: number;
};

/** Board after a drag, with the neighbours the update request orders the card against. */
export type KanbanCardMoveResult = {
    columns: ColumnState[];
    afterItemId: number | null;
    beforeItemId: number | null;
};

/**
 * Column state of a server board: every column, with no page in flight.
 *
 * @param board - Board sent by Inertia, or null when the collection has no kanban field
 * @returns One state entry per column, in server order
 */
export function columnsFromBoard(board: KanbanBoard | null): ColumnState[] {
    return (board?.columns ?? []).map((column) => ({
        ...column,
        loading: false,
    }));
}

/**
 * Append one fetched page to a column.
 *
 * The server pages by offset, so a card can repeat across pages once the board
 * moved it; rows already shown are dropped. A missing paginator field keeps the
 * previous value, so a partial body never rewinds the column.
 *
 * @param column - Column whose next page was fetched
 * @param payload - JSON body of the column endpoint
 * @returns The column with the new rows, its paginator and `loading` cleared
 */
export function appendColumnPage(
    column: ColumnState,
    payload: KanbanColumnPayload,
): ColumnState {
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const seen = new Set(column.items.map((item) => item.id));
    const appended = rows.filter((item) => !seen.has(item.id));

    return {
        ...column,
        loading: false,
        current_page:
            typeof payload.current_page === 'number'
                ? payload.current_page
                : column.current_page,
        last_page:
            typeof payload.last_page === 'number'
                ? payload.last_page
                : column.last_page,
        total: typeof payload.total === 'number' ? payload.total : column.total,
        items: [...column.items, ...appended],
    };
}

/**
 * Recompute the board after a drag: pull the card out of its column, insert it
 * at `newIndex` of the target column and recompute both totals.
 *
 * A cross-column move decrements the source and increments the target; a move
 * inside one column keeps the total. `afterItemId` / `beforeItemId` are the
 * neighbours the update request orders the card against.
 *
 * @param columns - Columns as they were before the drag
 * @param move - Card, source and target column values, and the drop index
 * @returns The new columns and the neighbour ids, or null when the card is not
 *   in any column (nothing was dragged)
 */
export function applyCardMove(
    columns: readonly ColumnState[],
    move: KanbanCardMove,
): KanbanCardMoveResult | null {
    let moved: ItemRow | null = null;
    const without = columns.map((column) => {
        const remaining = column.items.filter((item) => {
            if (item.id === move.itemId) {
                moved = item;

                return false;
            }

            return true;
        });

        if (remaining.length === column.items.length) {
            return column;
        }

        return {
            ...column,
            items: remaining,
            total:
                move.fromValue === move.toValue
                    ? column.total
                    : Math.max(0, column.total - 1),
        };
    });

    if (moved === null) {
        return null;
    }

    const target = without.find((column) => column.value === move.toValue);
    const insertAt = Math.max(
        0,
        Math.min(move.newIndex, target?.items.length ?? 0),
    );
    const nextItems = [
        ...(target?.items.slice(0, insertAt) ?? []),
        moved,
        ...(target?.items.slice(insertAt) ?? []),
    ];
    const afterItemId =
        insertAt > 0 ? (nextItems[insertAt - 1]?.id ?? null) : null;
    const beforeItemId =
        insertAt < nextItems.length - 1
            ? (nextItems[insertAt + 1]?.id ?? null)
            : null;

    return {
        columns: without.map((column) => {
            if (column.value !== move.toValue) {
                return column;
            }

            return {
                ...column,
                items: nextItems,
                total:
                    move.fromValue === move.toValue
                        ? column.total
                        : column.total + 1,
            };
        }),
        afterItemId,
        beforeItemId,
    };
}

type UseKanbanColumnsOptions = {
    /** Board sent by Inertia; a new object reloads the columns during render. */
    board: KanbanBoard | null;
    collectionId: number;
    /** Kanban field, null when the collection has none. */
    fieldName: string | null;
    /** Cards per page, as seeded by the server. */
    perPage: number;
    /** Field filters, sort and flags of the current list page. */
    listQuery: QueryParams;
};

/**
 * Column state of the kanban board and the next page of one column.
 *
 * `loadMore` fetches `ItemBoardController.kanbanColumn` for the given column and
 * appends the page; the `sortableEpoch` counter remounts Sortable after a drag.
 */
export function useKanbanColumns({
    board,
    collectionId,
    fieldName,
    perPage,
    listQuery,
}: UseKanbanColumnsOptions): {
    columns: ColumnState[];
    setColumns: Dispatch<SetStateAction<ColumnState[]>>;
    columnsRef: RefObject<ColumnState[]>;
    sortableEpoch: number;
    bumpSortableEpoch: () => void;
    loadMore: (columnValue: string) => Promise<void>;
} {
    const [columns, setColumns] = useState<ColumnState[]>(() =>
        columnsFromBoard(board),
    );
    // Bump after onEnd destroy so Sortable remounts on a React-owned tree.
    const [sortableEpoch, setSortableEpoch] = useState(0);
    const columnsRef = useRef(columns);
    useLayoutEffect(() => {
        columnsRef.current = columns;
    });

    const [previousBoard, setPreviousBoard] = useState(board);

    // Reload the columns during render when Inertia sends a new board (React's
    // "adjust state on prop change" pattern); the epoch bump remounts Sortable.
    if (previousBoard !== board) {
        setPreviousBoard(board);
        setColumns(columnsFromBoard(board));
        setSortableEpoch((epoch) => epoch + 1);
    }

    const bumpSortableEpoch = useCallback(() => {
        setSortableEpoch((epoch) => epoch + 1);
    }, []);

    const loadMore = useCallback(
        async (columnValue: string) => {
            if (!fieldName) {
                return;
            }

            const column = columnsRef.current.find(
                (entry) => entry.value === columnValue,
            );

            if (
                !column ||
                column.loading ||
                column.current_page >= column.last_page
            ) {
                return;
            }

            const nextPage = column.current_page + 1;
            setColumns((current) =>
                current.map((entry) =>
                    entry.value === columnValue
                        ? { ...entry, loading: true }
                        : entry,
                ),
            );

            try {
                const url = ItemBoardController.kanbanColumn.url(collectionId, {
                    query: {
                        ...listQuery,
                        field: fieldName,
                        value: columnValue,
                        page: nextPage,
                        per_page: perPage,
                    },
                });
                const response = await fetch(url, {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error('kanban column fetch failed');
                }

                const payload = (await response.json()) as KanbanColumnPayload;

                setColumns((current) =>
                    current.map((entry) =>
                        entry.value === columnValue
                            ? appendColumnPage(entry, payload)
                            : entry,
                    ),
                );
            } catch {
                setColumns((current) =>
                    current.map((entry) =>
                        entry.value === columnValue
                            ? { ...entry, loading: false }
                            : entry,
                    ),
                );
            }
        },
        [collectionId, fieldName, listQuery, perPage],
    );

    return {
        columns,
        setColumns,
        columnsRef,
        sortableEpoch,
        bumpSortableEpoch,
        loadMore,
    };
}
