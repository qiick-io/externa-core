import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ItemRow } from '@/types';
import type { ColumnAlign } from './column-header-menu';
import type { ItemsFilters, ListLayout } from './items-index-helpers';
import { useItemsListFilters } from './use-items-list-filters';
import { useItemsListPrefs } from './use-items-list-prefs';
import { useItemsListSelection } from './use-items-list-selection';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: mocks,
}));

function decodedUrl(call: unknown[] | undefined): string {
    const url = call?.[0];

    return decodeURIComponent(typeof url === 'string' ? url : '');
}

describe('useItemsListPrefs', () => {
    beforeEach(() => {
        mocks.put.mockReset();
    });

    function renderPrefs(initial: {
        listColumnsProp: string[];
        listLayoutProp: ListLayout;
    }) {
        const headerRowRef = createRef<HTMLTableRowElement>();
        const columnAlignsProp: Record<string, ColumnAlign> = {
            title: 'right',
        };

        return renderHook(
            ({ listColumnsProp, listLayoutProp }) =>
                useItemsListPrefs({
                    collectionId: 4,
                    listColumnsProp,
                    columnAlignsProp,
                    listLayoutProp,
                    kanbanFieldProp: 'status',
                    calendarFieldProp: null,
                    headerRowRef,
                }),
            { initialProps: initial },
        );
    }

    it('saves the layout with the current columns and fields', () => {
        const { result } = renderPrefs({
            listColumnsProp: ['title', 'id'],
            listLayoutProp: 'table',
        });

        act(() => result.current.setLayout('kanban'));

        expect(result.current.listLayout).toBe('kanban');
        expect(mocks.put).toHaveBeenCalledWith(
            expect.stringContaining('/collections/4/'),
            {
                columns: ['title', 'id'],
                aligns: { title: 'right' },
                layout: 'kanban',
                kanban_field: 'status',
                calendar_field: null,
            },
            { preserveScroll: true, preserveState: true },
        );
    });

    it('drops the alignment of hidden columns', () => {
        const { result } = renderPrefs({
            listColumnsProp: ['title', 'id'],
            listLayoutProp: 'table',
        });

        act(() => result.current.persistColumns(['id']));

        expect(result.current.listColumns).toEqual(['id']);
        expect(result.current.columnAligns).toEqual({});
    });

    it('adopts new server columns and layout', () => {
        const { result, rerender } = renderPrefs({
            listColumnsProp: ['title'],
            listLayoutProp: 'table',
        });

        rerender({ listColumnsProp: ['id'], listLayoutProp: 'calendar' });

        expect(result.current.listColumns).toEqual(['id']);
        expect(result.current.listLayout).toBe('calendar');
    });
});

describe('useItemsListFilters', () => {
    beforeEach(() => {
        mocks.get.mockReset();
    });

    function renderFilters(filters: ItemsFilters, listLayout: ListLayout) {
        return renderHook(
            ({ currentFilters }) =>
                useItemsListFilters({
                    collectionId: 4,
                    filters: currentFilters,
                    perPage: 25,
                    listLayout,
                    kanbanField: 'status',
                    calendarField: null,
                }),
            { initialProps: { currentFilters: filters } },
        );
    }

    it('mirrors the title filter into the search box and the rules', () => {
        const { result } = renderFilters(
            { title: { _contains: 'news' } },
            'table',
        );

        expect(result.current.filterTitle).toBe('news');
        expect(result.current.filterRules).toEqual([
            expect.objectContaining({
                field: 'title',
                operator: '_contains',
                value: 'news',
            }),
        ]);
    });

    it('visits with sort, trash and the kanban layout on the URL', () => {
        const { result } = renderFilters(
            { sort: 'title', direction: 'asc' },
            'kanban',
        );

        act(() => result.current.visit({ trashed: true }));

        const url = decodedUrl(mocks.get.mock.calls[0]);
        expect(url).toContain('/collections/4/items');
        expect(url).toContain('sort=title');
        expect(url).toContain('direction=asc');
        expect(url).toContain('trashed=1');
        expect(url).toContain('layout=kanban');
        expect(url).toContain('kanban_field=status');
        expect(mocks.get.mock.calls[0]?.[2]).toEqual({
            preserveState: true,
            preserveScroll: true,
        });
    });

    it('clears search, rules and the draft and review toggles', () => {
        const { result } = renderFilters(
            { title: 'news', has_draft: true },
            'table',
        );

        act(() => result.current.clearFilters());

        expect(result.current.filterTitle).toBe('');
        expect(result.current.filterRules).toEqual([]);
        const url = decodedUrl(mocks.get.mock.calls[0]);
        expect(url).not.toContain('has_draft');
        expect(url).not.toContain('filter');
    });
});

describe('useItemsListSelection', () => {
    beforeEach(() => {
        mocks.post.mockReset();
        mocks.delete.mockReset();
    });

    const rows = [{ id: 1 }, { id: 2 }] as ItemRow[];

    it('toggles rows and clears the selection on the trash view', () => {
        const { result, rerender } = renderHook(
            ({ isTrashed }) => useItemsListSelection(4, rows, isTrashed),
            { initialProps: { isTrashed: false } },
        );

        act(() => result.current.toggleAll(true));
        expect(result.current.selected).toEqual([1, 2]);

        act(() => result.current.toggleRow(1));
        expect(result.current.selected).toEqual([2]);

        rerender({ isTrashed: true });
        expect(result.current.selected).toEqual([]);
    });

    it('posts the confirmed bulk action with the selected ids', () => {
        const { result } = renderHook(() =>
            useItemsListSelection(4, rows, false),
        );

        act(() => result.current.toggleAll(true));
        act(() => result.current.setPendingBulkAction('delete'));
        act(() => result.current.confirmBulkAction());

        expect(result.current.confirmingDestructive).toBe(true);
        expect(mocks.post).toHaveBeenCalledWith(
            expect.stringContaining('/collections/4/'),
            { ids: [1, 2], action: 'delete' },
            expect.objectContaining({ preserveScroll: true }),
        );
    });

    it('deletes nothing without a pending item', () => {
        const { result } = renderHook(() =>
            useItemsListSelection(4, rows, false),
        );

        act(() => result.current.confirmDelete());
        act(() => result.current.confirmForceDelete());

        expect(mocks.delete).not.toHaveBeenCalled();
    });
});
