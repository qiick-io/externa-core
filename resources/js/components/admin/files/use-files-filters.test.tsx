import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import filesRoutes from '@/routes/files';
import { useFilesFilters } from './use-files-filters';
import type { FileFilters } from './use-files-filters';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const breadcrumbs = [
    { id: 1, name: 'Docs' },
    { id: 2, name: 'Invoices' },
];

describe('useFilesFilters', () => {
    it('starts from the server filters', () => {
        const { result } = renderHook(() =>
            useFilesFilters(
                {
                    trashed: 'only',
                    tag_ids: [4],
                    sort: 'size',
                    direction: 'desc',
                },
                2,
                breadcrumbs,
            ),
        );

        expect(result.current.isTrashed).toBe(true);
        expect(result.current.selectedTagIds).toEqual([4]);
        expect(result.current.sort).toBe('size');
        expect(result.current.direction).toBe('desc');
    });

    it('defaults to active files sorted by name', () => {
        const { result } = renderHook(() => useFilesFilters({}, null, []));

        expect(result.current.trashed).toBe('active');
        expect(result.current.sort).toBe('name');
        expect(result.current.direction).toBe('asc');
    });

    it('builds folder breadcrumbs that keep the sort and tag filter', () => {
        const { result } = renderHook(() =>
            useFilesFilters({ tag_ids: [4] }, 2, breadcrumbs),
        );
        const listQuery = { sort: 'name', direction: 'asc', tag_ids: [4] };

        expect(result.current.pageBreadcrumbs).toEqual([
            {
                title: 'files.title',
                href: filesRoutes.index.url(undefined, { query: listQuery }),
            },
            {
                title: 'Docs',
                href: filesRoutes.index.url(1, { query: listQuery }),
            },
            {
                title: 'Invoices',
                href: filesRoutes.index.url(2, { query: listQuery }),
            },
        ]);
    });

    it('drops the folder breadcrumbs in the trash', () => {
        const { result } = renderHook(() =>
            useFilesFilters({ trashed: 'only' }, 2, breadcrumbs),
        );

        expect(result.current.pageBreadcrumbs).toHaveLength(1);
    });

    it('builds index URLs from the current filters and overrides', () => {
        const { result } = renderHook(() =>
            useFilesFilters({ sort: 'size' }, 2, breadcrumbs),
        );

        expect(result.current.buildFilesIndexUrl()).toBe(
            filesRoutes.index.url(2, {
                query: { sort: 'size', direction: 'asc' },
            }),
        );
        expect(
            result.current.buildFilesIndexUrl({
                folderId: null,
                nextTagIds: [7],
                nextDirection: 'desc',
            }),
        ).toBe(
            filesRoutes.index.url(undefined, {
                query: { tag_ids: [7], sort: 'size', direction: 'desc' },
            }),
        );
        expect(
            result.current.buildFilesIndexUrl({ nextTrashed: 'trashed' }),
        ).toBe(
            filesRoutes.index.url(undefined, {
                query: { trashed: 'only', sort: 'size', direction: 'asc' },
            }),
        );
    });

    it('follows new server filters after a visit', () => {
        const { result, rerender } = renderHook(
            ({ filters }) => useFilesFilters(filters, null, []),
            { initialProps: { filters: { tag_ids: [1] } as FileFilters } },
        );

        rerender({
            filters: { tag_ids: [2, 3], sort: 'updated_at', direction: 'desc' },
        });

        expect(result.current.selectedTagIds).toEqual([2, 3]);
        expect(result.current.sort).toBe('updated_at');
        expect(result.current.direction).toBe('desc');
    });
});
