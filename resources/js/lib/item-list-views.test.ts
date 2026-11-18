import { describe, expect, it } from 'vite-plus/test';
import { buildItemListQuery, itemRowTitle } from '@/lib/item-list-views';
import type { ItemRow } from '@/types';

const row = (
    data: Record<string, unknown>,
    displays?: Record<string, unknown>,
) => ({ id: 7, data, displays }) as unknown as ItemRow;

describe('itemRowTitle', () => {
    it('prefers the display title, then data.title, then #id', () => {
        expect(itemRowTitle(row({ title: 'Raw' }, { title: 'Shown' }))).toBe(
            'Shown',
        );
        expect(itemRowTitle(row({ title: 'Raw' }))).toBe('Raw');
        expect(itemRowTitle(row({ title: { en: '', it: 'Ciao' } }))).toBe(
            'Ciao',
        );
        expect(itemRowTitle(row({ title: 42 }))).toBe('42');
        expect(itemRowTitle(row({}))).toBe('#7');
    });
});

describe('buildItemListQuery', () => {
    it('splits field filters from list flags and sort', () => {
        expect(
            buildItemListQuery({
                status: { _eq: 'draft' },
                trashed: true,
                has_draft: false,
                sort: 'title',
                direction: 'desc',
            }),
        ).toEqual({
            filter: { status: { _eq: 'draft' } },
            trashed: true,
            sort: 'title',
            direction: 'desc',
        });
    });

    it('omits filter when only flags are set', () => {
        expect(buildItemListQuery({ in_review: true })).toEqual({
            in_review: true,
        });
    });
});
