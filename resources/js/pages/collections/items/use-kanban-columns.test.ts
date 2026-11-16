import { act, renderHook } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import type { ItemRow } from '@/types';
import {
    applyCardMove,
    appendColumnPage,
    columnsFromBoard,
    useKanbanColumns,
} from './use-kanban-columns';
import type {
    ColumnState,
    KanbanBoard,
    KanbanColumnPage,
    KanbanColumnPayload,
} from './use-kanban-columns';

function item(id: number): ItemRow {
    return { id, data: { title: `item ${id}` } };
}

function column(
    value: string,
    ids: number[],
    overrides: Partial<KanbanColumnPage> = {},
): ColumnState {
    return {
        value,
        label: value === '' ? 'No value' : value,
        total: ids.length,
        current_page: 1,
        last_page: 1,
        items: ids.map(item),
        loading: false,
        ...overrides,
    };
}

function board(columns: KanbanColumnPage[]): KanbanBoard {
    return { field: 'status', per_page: 30, columns };
}

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
    mocks.fetch.mockReset();
    vi.unstubAllGlobals();
});

function renderColumns(initialBoard: KanbanBoard | null) {
    return renderHook(
        ({ currentBoard }: { currentBoard: KanbanBoard | null }) =>
            useKanbanColumns({
                board: currentBoard,
                collectionId: 4,
                fieldName: currentBoard?.field ?? null,
                perPage: currentBoard?.per_page ?? 30,
                listQuery: { sort: 'id' },
            }),
        { initialProps: { currentBoard: initialBoard } },
    );
}

describe('columnsFromBoard', () => {
    it('maps a board to column state with nothing loading', () => {
        const columns = columnsFromBoard(
            board([
                {
                    value: 'todo',
                    label: 'Todo',
                    total: 2,
                    current_page: 1,
                    last_page: 2,
                    items: [item(1), item(2)],
                },
            ]),
        );

        expect(columns).toEqual([
            expect.objectContaining({
                value: 'todo',
                total: 2,
                current_page: 1,
                last_page: 2,
                loading: false,
            }),
        ]);
        expect(columns[0]?.items.map((row) => row.id)).toEqual([1, 2]);
    });

    it('has no columns without a board', () => {
        expect(columnsFromBoard(null)).toEqual([]);
    });
});

describe('appendColumnPage', () => {
    it('appends a page, dropping cards already shown', () => {
        const appended = appendColumnPage(column('todo', [1, 2]), {
            data: [item(2), item(3)],
            current_page: 2,
            last_page: 3,
            total: 7,
        });

        expect(appended.items.map((row) => row.id)).toEqual([1, 2, 3]);
        expect(appended.current_page).toBe(2);
        expect(appended.last_page).toBe(3);
        expect(appended.total).toBe(7);
        expect(appended.loading).toBe(false);
    });

    it('keeps the paginator when the body leaves it out', () => {
        const appended = appendColumnPage(column('todo', [1]), {});

        expect(appended.items.map((row) => row.id)).toEqual([1]);
        expect(appended.current_page).toBe(1);
        expect(appended.last_page).toBe(1);
        expect(appended.total).toBe(1);
    });
});

describe('applyCardMove', () => {
    it('reorders cards inside one column and keeps its total', () => {
        const result = applyCardMove([column('todo', [1, 2, 3])], {
            itemId: 1,
            fromValue: 'todo',
            toValue: 'todo',
            newIndex: 2,
        });

        expect(result?.columns[0]?.items.map((row) => row.id)).toEqual([
            2, 3, 1,
        ]);
        expect(result?.columns[0]?.total).toBe(3);
        expect(result?.afterItemId).toBe(3);
        expect(result?.beforeItemId).toBeNull();
    });

    it('moves a card across two columns and fixes both totals', () => {
        const columns = [column('todo', [1, 2]), column('done', [3])];

        const toEnd = applyCardMove(columns, {
            itemId: 1,
            fromValue: 'todo',
            toValue: 'done',
            newIndex: 1,
        });

        expect(toEnd?.columns[0]?.items.map((row) => row.id)).toEqual([2]);
        expect(toEnd?.columns[0]?.total).toBe(1);
        expect(toEnd?.columns[1]?.items.map((row) => row.id)).toEqual([3, 1]);
        expect(toEnd?.columns[1]?.total).toBe(2);
        expect(toEnd?.afterItemId).toBe(3);
        expect(toEnd?.beforeItemId).toBeNull();

        const toStart = applyCardMove(columns, {
            itemId: 1,
            fromValue: 'todo',
            toValue: 'done',
            newIndex: 0,
        });

        expect(toStart?.columns[1]?.items.map((row) => row.id)).toEqual([1, 3]);
        expect(toStart?.columns[1]?.total).toBe(2);
        expect(toStart?.afterItemId).toBeNull();
        expect(toStart?.beforeItemId).toBe(3);
    });

    it('returns null when the card is not in the columns', () => {
        expect(
            applyCardMove([column('todo', [1])], {
                itemId: 9,
                fromValue: 'todo',
                toValue: 'done',
                newIndex: 0,
            }),
        ).toBeNull();
    });
});

describe('useKanbanColumns', () => {
    it('starts from the board and adopts a new board', () => {
        const { result, rerender } = renderColumns(
            board([
                {
                    value: 'todo',
                    label: 'Todo',
                    total: 1,
                    current_page: 1,
                    last_page: 1,
                    items: [item(1)],
                },
            ]),
        );

        expect(result.current.columns.map((entry) => entry.value)).toEqual([
            'todo',
        ]);
        expect(result.current.columns[0]?.loading).toBe(false);

        rerender({
            currentBoard: board([
                {
                    value: 'done',
                    label: 'Done',
                    total: 2,
                    current_page: 1,
                    last_page: 2,
                    items: [item(2)],
                },
            ]),
        });

        expect(result.current.columns.map((entry) => entry.value)).toEqual([
            'done',
        ]);
        expect(result.current.columns[0]?.loading).toBe(false);
        expect(result.current.sortableEpoch).toBe(1);
    });

    it('loads the next page of one column', async () => {
        const payload: KanbanColumnPayload = {
            data: [item(2), item(3)],
            current_page: 2,
            last_page: 3,
            total: 5,
        };
        mocks.fetch.mockResolvedValue({
            ok: true,
            json: async () => payload,
        });
        const { result } = renderColumns(
            board([
                {
                    value: 'todo',
                    label: 'Todo',
                    total: 5,
                    current_page: 1,
                    last_page: 3,
                    items: [item(1), item(2)],
                },
            ]),
        );

        await act(async () => {
            await result.current.loadMore('todo');
        });

        const url = String(mocks.fetch.mock.calls[0]?.[0]);

        expect(url).toContain('/collections/4/items/kanban-column');
        expect(url).toContain('field=status');
        expect(url).toContain('value=todo');
        expect(url).toContain('page=2');
        expect(url).toContain('per_page=30');
        expect(mocks.fetch.mock.calls[0]?.[1]).toEqual({
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        });
        expect(result.current.columns[0]?.items.map((row) => row.id)).toEqual([
            1, 2, 3,
        ]);
        expect(result.current.columns[0]?.current_page).toBe(2);
        expect(result.current.columns[0]?.last_page).toBe(3);
        expect(result.current.columns[0]?.total).toBe(5);
        expect(result.current.columns[0]?.loading).toBe(false);
    });

    it('clears loading when the fetch fails', async () => {
        mocks.fetch.mockResolvedValue({ ok: false });
        const { result } = renderColumns(
            board([
                {
                    value: 'todo',
                    label: 'Todo',
                    total: 3,
                    current_page: 1,
                    last_page: 2,
                    items: [item(1)],
                },
            ]),
        );

        await act(async () => {
            await result.current.loadMore('todo');
        });

        expect(result.current.columns[0]?.items.map((row) => row.id)).toEqual([
            1,
        ]);
        expect(result.current.columns[0]?.loading).toBe(false);
    });

    it('does not fetch while a page is in flight or after the last page', async () => {
        let resolveFetch: (value: unknown) => void = () => {};
        const pending = new Promise((resolve) => {
            resolveFetch = resolve;
        });
        mocks.fetch.mockReturnValueOnce(pending);
        const { result, rerender } = renderColumns(
            board([
                {
                    value: 'todo',
                    label: 'Todo',
                    total: 3,
                    current_page: 1,
                    last_page: 2,
                    items: [item(1)],
                },
            ]),
        );

        act(() => {
            void result.current.loadMore('todo');
        });

        expect(result.current.columns[0]?.loading).toBe(true);

        await act(async () => {
            await result.current.loadMore('todo');
        });

        expect(mocks.fetch).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveFetch({
                ok: true,
                json: async () => ({
                    data: [],
                    current_page: 2,
                    last_page: 2,
                    total: 3,
                }),
            });
        });

        await act(async () => {
            await result.current.loadMore('todo');
        });

        expect(mocks.fetch).toHaveBeenCalledTimes(1);

        rerender({
            currentBoard: board([
                {
                    value: 'done',
                    label: 'Done',
                    total: 0,
                    current_page: 1,
                    last_page: 1,
                    items: [],
                },
            ]),
        });

        await act(async () => {
            await result.current.loadMore('done');
        });

        expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
});
