import { describe, expect, it } from 'vite-plus/test';
import { moveItem, newListItemId } from '@/lib/list-items';

describe('moveItem', () => {
    it('moves an entry and leaves the input untouched', () => {
        const items = ['a', 'b', 'c'];

        expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a']);
        expect(items).toEqual(['a', 'b', 'c']);
    });

    it('returns the same array for an out-of-range source', () => {
        const items = ['a'];

        expect(moveItem(items, 5, 0)).toBe(items);
    });
});

describe('newListItemId', () => {
    it('returns distinct v4 UUIDs', () => {
        const first = newListItemId();

        expect(first).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(newListItemId()).not.toBe(first);
    });
});
