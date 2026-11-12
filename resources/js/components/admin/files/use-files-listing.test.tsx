import { act, renderHook, waitFor } from '@testing-library/react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import type { AdminFileRow, FilesPaginator } from '@/types/files';
import { useFilesListing } from './use-files-listing';

const mocks = vi.hoisted(() => ({
    listFilesPage: vi.fn(),
    routerVisit: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@inertiajs/react', () => ({
    router: { visit: mocks.routerVisit },
}));

vi.mock('@/lib/files-api', () => ({
    listFilesPage: mocks.listFilesPage,
}));

vi.mock('@/lib/toast', () => ({
    toast: { error: mocks.toastError },
}));

function fileRow(id: number): AdminFileRow {
    return { id, name: `file-${id}`, type: 'file' } as AdminFileRow;
}

function paginator(
    ids: number[],
    currentPage: number,
    lastPage: number,
): FilesPaginator {
    return {
        data: ids.map(fileRow),
        current_page: currentPage,
        last_page: lastPage,
        per_page: 2,
        total: 0,
    };
}

function renderListing(initialFiles: FilesPaginator) {
    return renderHook(() =>
        useFilesListing({
            initialFiles,
            parentId: 7,
            isTrashed: false,
            selectedTagIds: [3],
            sort: 'name',
            direction: 'asc',
        }),
    );
}

describe('useFilesListing', () => {
    beforeEach(() => {
        mocks.listFilesPage.mockReset();
        mocks.routerVisit.mockReset();
        mocks.toastError.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts from the server page', () => {
        const { result } = renderListing(paginator([1, 2], 1, 2));

        expect(result.current.files.map((file) => file.id)).toEqual([1, 2]);
        expect(result.current.hasMore).toBe(true);
        expect(result.current.isLoadingMore).toBe(false);
    });

    it('searches through the API after a 300 ms debounce', async () => {
        vi.useFakeTimers();
        mocks.listFilesPage.mockResolvedValue(paginator([9], 1, 1));
        const { result } = renderListing(paginator([1, 2], 1, 2));

        act(() => {
            result.current.setSearch('  report ');
        });

        act(() => {
            vi.advanceTimersByTime(299);
        });
        expect(mocks.listFilesPage).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
            await Promise.resolve();
        });

        expect(mocks.listFilesPage).toHaveBeenCalledWith({
            parentId: 7,
            trashed: null,
            page: 1,
            search: 'report',
            tagIds: [3],
            sort: 'name',
            direction: 'asc',
        });
        expect(result.current.files.map((file) => file.id)).toEqual([9]);
        expect(result.current.hasMore).toBe(false);
    });

    it('appends the next page without duplicates', async () => {
        mocks.listFilesPage.mockResolvedValue(paginator([2, 3], 2, 2));
        const { result } = renderListing(paginator([1, 2], 1, 2));

        await act(async () => {
            await result.current.loadMore();
        });

        expect(mocks.listFilesPage).toHaveBeenCalledWith(
            expect.objectContaining({ page: 2, search: undefined }),
        );
        expect(result.current.files.map((file) => file.id)).toEqual([1, 2, 3]);
        expect(result.current.hasMore).toBe(false);
    });

    it('refreshes every page already on screen', async () => {
        mocks.listFilesPage.mockResolvedValueOnce(paginator([2, 3], 2, 3));
        const { result } = renderListing(paginator([1, 2], 1, 3));

        await act(async () => {
            await result.current.loadMore();
        });

        mocks.listFilesPage.mockReset();
        mocks.listFilesPage.mockImplementation(({ page }: { page: number }) =>
            Promise.resolve(
                page === 1 ? paginator([1, 4], 1, 3) : paginator([4, 5], 2, 3),
            ),
        );

        act(() => {
            result.current.refreshPage();
        });

        await waitFor(() => {
            expect(result.current.files.map((file) => file.id)).toEqual([
                1, 4, 5,
            ]);
        });
        expect(mocks.listFilesPage).toHaveBeenCalledTimes(2);
        expect(result.current.hasMore).toBe(true);
    });

    it('falls back to an Inertia reload when the refresh fails', async () => {
        mocks.listFilesPage.mockRejectedValue(new Error('offline'));
        const { result } = renderListing(paginator([1], 1, 1));

        act(() => {
            result.current.refreshPage();
        });

        await waitFor(() => {
            expect(mocks.routerVisit).toHaveBeenCalledWith(
                window.location.href,
                { only: ['files'], preserveScroll: true, preserveState: true },
            );
        });
    });

    it('ignores a load-more response after a filter visit began', async () => {
        let resolvePage: (value: FilesPaginator) => void = () => {};
        mocks.listFilesPage.mockReturnValue(
            new Promise<FilesPaginator>((resolve) => {
                resolvePage = resolve;
            }),
        );
        const { result } = renderListing(paginator([1, 2], 1, 2));

        let pendingLoad: Promise<void> = Promise.resolve();

        act(() => {
            pendingLoad = result.current.loadMore();
        });

        expect(result.current.isLoadingMore).toBe(true);

        act(() => {
            result.current.beginListFilterVisit();
        });

        await act(async () => {
            resolvePage(paginator([3], 2, 2));
            await pendingLoad;
        });

        expect(result.current.files.map((file) => file.id)).toEqual([1, 2]);
        expect(result.current.isLoadingMore).toBe(false);
        expect(result.current.hasMore).toBe(false);
    });
});
