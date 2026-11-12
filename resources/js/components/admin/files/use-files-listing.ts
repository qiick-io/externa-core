import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    FileSortDirection,
    FileSortField,
} from '@/components/admin/files/use-files-filters';
import { listFilesPage } from '@/lib/files-api';
import { toast } from '@/lib/toast';
import type { FilesPaginator } from '@/types/files';

type UseFilesListingOptions = {
    initialFiles: FilesPaginator;
    parentId: number | null;
    isTrashed: boolean;
    selectedTagIds: number[];
    sort: FileSortField;
    direction: FileSortDirection;
};

/**
 * Keeps the file manager's visible rows: the server page from Inertia props,
 * the debounced API search, "load more" pagination and in-place refreshes.
 *
 * A generation counter invalidates in-flight responses whenever the list is
 * replaced (new props, a new search, a refresh), so a slow "load more" or
 * search can never append to or overwrite a newer list.
 */
export function useFilesListing({
    initialFiles,
    parentId,
    isTrashed,
    selectedTagIds,
    sort,
    direction,
}: UseFilesListingOptions) {
    const { t } = useTranslation();
    const [files, setFiles] = useState(initialFiles.data);
    const [page, setPage] = useState(initialFiles.current_page);
    const [lastPage, setLastPage] = useState(initialFiles.last_page);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    // ponytail: ref lock + generation beat double-click / stale load-more races
    const loadingMoreRef = useRef(false);
    const listGenerationRef = useRef(0);
    // Pages on screen, read by refreshPage without re-creating it on every load.
    const loadedPageRef = useRef(page);

    useEffect(() => {
        loadedPageRef.current = page;
    }, [page]);
    const [search, setSearch] = useState('');

    const applyServerPage = useCallback((paginator: FilesPaginator): void => {
        listGenerationRef.current += 1;
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
        setFiles(paginator.data);
        setPage(paginator.current_page);
        setLastPage(paginator.last_page);
    }, []);

    const beginListFilterVisit = useCallback((): void => {
        // Invalidate load-more and hide the button until page-1 props arrive.
        // Keep current cards visible to avoid an empty-folder flash mid-visit.
        listGenerationRef.current += 1;
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
        setPage(1);
        setLastPage(1);
    }, []);

    useEffect(() => {
        if (search.trim() !== '') {
            return;
        }

        // oxlint-disable-next-line react/set-state-in-effect -- moved as is from pages/admin/files/index.tsx (#283), where the compiler skipped it; moving the sync out of the effect changes render timing
        applyServerPage(initialFiles);
    }, [applyServerPage, initialFiles, search]);

    useEffect(() => {
        const term = search.trim();

        if (term === '') {
            return;
        }

        const requestGeneration = listGenerationRef.current + 1;
        listGenerationRef.current = requestGeneration;
        loadingMoreRef.current = false;
        // oxlint-disable-next-line react/set-state-in-effect -- moved as is from pages/admin/files/index.tsx (#283), where the compiler skipped it; moving the sync out of the effect changes render timing
        setIsLoadingMore(false);

        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    const next = await listFilesPage({
                        parentId,
                        trashed: isTrashed ? 'only' : null,
                        page: 1,
                        search: term,
                        tagIds: selectedTagIds,
                        sort,
                        direction,
                    });

                    if (requestGeneration !== listGenerationRef.current) {
                        return;
                    }

                    setFiles(next.data);
                    setPage(next.current_page);
                    setLastPage(next.last_page);
                } catch (error) {
                    if (requestGeneration !== listGenerationRef.current) {
                        return;
                    }

                    toast.error(
                        error instanceof Error
                            ? error.message
                            : t('files.toasts.searchFailed'),
                    );
                }
            })();
        }, 300);

        return () => {
            window.clearTimeout(timer);
        };
    }, [direction, isTrashed, parentId, search, selectedTagIds, sort, t]);

    const refreshPage = useCallback(() => {
        // Invalidate in-flight load-more before fetching fresh data.
        const requestGeneration = listGenerationRef.current + 1;
        listGenerationRef.current = requestGeneration;
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
        // Reload every page already on screen, so uploads, moves and deletes keep the
        // list as long as it was (and the scroll position) instead of cutting it to page 1.
        const loadedPages = loadedPageRef.current;
        const fetchPage = (pageNumber: number) =>
            listFilesPage({
                parentId,
                trashed: isTrashed ? 'only' : null,
                page: pageNumber,
                search: search.trim() || undefined,
                tagIds: selectedTagIds,
                sort,
                direction,
            });
        void (async () => {
            try {
                const first = await fetchPage(1);
                const lastLoadedPage = Math.min(loadedPages, first.last_page);
                const rest = await Promise.all(
                    Array.from({ length: lastLoadedPage - 1 }, (_, index) =>
                        fetchPage(index + 2),
                    ),
                );

                if (requestGeneration !== listGenerationRef.current) {
                    return;
                }

                const seenIds = new Set<number>();
                const merged = [first, ...rest]
                    .flatMap((paginator) => paginator.data)
                    .filter((file) => {
                        if (seenIds.has(file.id)) {
                            return false;
                        }

                        seenIds.add(file.id);

                        return true;
                    });

                setFiles(merged);
                setPage(lastLoadedPage);
                setLastPage(rest.at(-1)?.last_page ?? first.last_page);
            } catch {
                // Fallback to Inertia reload if API fetch fails
                router.visit(window.location.href, {
                    only: ['files'],
                    preserveScroll: true,
                    preserveState: true,
                });
            }
        })();
    }, [direction, isTrashed, parentId, search, selectedTagIds, sort]);

    const loadMore = useCallback(async (): Promise<void> => {
        if (loadingMoreRef.current || page >= lastPage) {
            return;
        }

        const requestGeneration = listGenerationRef.current;
        const nextPage = page + 1;
        loadingMoreRef.current = true;
        setIsLoadingMore(true);

        try {
            const next = await listFilesPage({
                parentId,
                trashed: isTrashed ? 'only' : null,
                page: nextPage,
                search: search.trim() || undefined,
                tagIds: selectedTagIds,
                sort,
                direction,
            });

            if (requestGeneration !== listGenerationRef.current) {
                return;
            }

            setFiles((current) => {
                const seenIds = new Set(current.map((file) => file.id));
                const appended = next.data.filter(
                    (file) => !seenIds.has(file.id),
                );

                return appended.length === 0
                    ? current
                    : [...current, ...appended];
            });
            setPage(next.current_page);
            setLastPage(next.last_page);
        } catch (error) {
            if (requestGeneration !== listGenerationRef.current) {
                return;
            }

            toast.error(
                error instanceof Error
                    ? error.message
                    : t('files.toasts.loadMoreFailed'),
            );
        } finally {
            if (requestGeneration === listGenerationRef.current) {
                loadingMoreRef.current = false;
                setIsLoadingMore(false);
            }
        }
    }, [
        direction,
        isTrashed,
        lastPage,
        page,
        parentId,
        search,
        selectedTagIds,
        sort,
        t,
    ]);

    return {
        files,
        setFiles,
        search,
        setSearch,
        hasMore: page < lastPage,
        isLoadingMore,
        loadMore,
        refreshPage,
        beginListFilterVisit,
    };
}
