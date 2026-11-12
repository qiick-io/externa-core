import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
    readDomFieldOrder,
    restoreFieldDomToStart,
} from '@/components/collections/fields-list/field-list-layout';
import type { CollectionFieldRow } from '@/types';
import { useSortableFields } from './use-sortable-fields';

vi.mock('@inertiajs/react', () => ({
    router: { post: vi.fn() },
}));

function field(
    id: number,
    name: string,
    type = 'text',
    settings: Record<string, unknown> = {},
): CollectionFieldRow {
    return { id, name, type, translatable: false, sort_order: id, settings };
}

describe('useSortableFields', () => {
    it('lists flat fields without a tree and keeps their row breaks', () => {
        const fields = [
            field(1, 'title'),
            field(2, 'body', 'text', { layout_starts_new_row: true }),
        ];
        const rootRef = createRef<HTMLDivElement>();
        const { result } = renderHook(() =>
            useSortableFields(7, fields, rootRef),
        );

        expect(result.current.hasGroups).toBe(false);
        expect(result.current.fieldTree).toBeNull();
        expect(result.current.orderedFields).toBe(fields);
        expect(Array.from(result.current.rowBreakFieldIds)).toEqual([2]);
    });

    it('builds the group tree and follows new server fields', () => {
        const rootRef = createRef<HTMLDivElement>();
        const { result, rerender } = renderHook(
            ({ fields }) => useSortableFields(7, fields, rootRef),
            { initialProps: { fields: [field(1, 'title')] } },
        );

        const grouped = [
            field(3, 'details', 'group_raw'),
            field(4, 'summary', 'text', { group: 'details' }),
        ];
        rerender({ fields: grouped });

        expect(result.current.hasGroups).toBe(true);
        expect(result.current.orderedFields).toBe(grouped);
        expect(result.current.fieldTree?.[0]?.field.name).toBe('details');
        expect(result.current.fieldTree?.[0]?.children[0]?.field.name).toBe(
            'summary',
        );
    });
});

describe('field list DOM helpers', () => {
    function board(): HTMLElement {
        const root = document.createElement('div');
        root.innerHTML = `
            <div data-field-list data-group-parent="">
                <div data-sortable-id="1" data-field-name="title"></div>
                <div data-sortable-id="3" data-field-name="details">
                    <div data-field-list data-group-parent="details">
                        <div data-sortable-id="4" data-field-name="summary"></div>
                    </div>
                </div>
            </div>`;

        return root.querySelector<HTMLElement>('[data-field-list]')!;
    }

    it('reads the depth-first order and parent group of each field', () => {
        const { ids, groups } = readDomFieldOrder(board());

        expect(ids).toEqual([1, 3, 4]);
        expect(groups.get(1)).toBeNull();
        expect(groups.get(4)).toBe('details');
    });

    it('puts reordered nested nodes back in their pre-drag order', () => {
        const rootList = board();
        const nestedList = rootList.querySelector<HTMLElement>(
            '[data-group-parent="details"]',
        )!;
        const extra = document.createElement('div');
        extra.dataset.sortableId = '5';
        extra.dataset.fieldName = 'extra';
        nestedList.prepend(extra);

        const groups = new Map<number, string | null>([
            [1, null],
            [3, null],
            [4, 'details'],
            [5, 'details'],
        ]);
        restoreFieldDomToStart(rootList, [1, 3, 4, 5], groups);

        expect(readDomFieldOrder(rootList).ids).toEqual([1, 3, 4, 5]);
    });
});
