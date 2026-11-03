import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LIST_PER_PAGE,
    listPerPageQuery,
    listUrlWithPerPage,
} from '@/lib/pagination';

describe('list per-page helpers', () => {
    it('sets per_page, resets page and keeps every other query param', () => {
        expect(
            listUrlWithPerPage(
                'http://localhost/list?search=ada&sort=email&page=3&trashed=1',
                50,
            ),
        ).toBe('/list?search=ada&sort=email&trashed=1&per_page=50');
    });

    it('drops per_page from the URL for the default size', () => {
        expect(
            listUrlWithPerPage(
                '/list?per_page=50&page=2',
                DEFAULT_LIST_PER_PAGE,
            ),
        ).toBe('/list');
    });

    it('keeps only non-default sizes when lists rebuild their URLs', () => {
        expect(listPerPageQuery(50)).toBe(50);
        expect(listPerPageQuery(DEFAULT_LIST_PER_PAGE)).toBeUndefined();
        expect(listPerPageQuery(undefined)).toBeUndefined();
    });
});
