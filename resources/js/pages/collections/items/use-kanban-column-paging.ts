import { useEffect } from 'react';
import type { RefObject } from 'react';

type UseKanbanColumnPagingOptions = {
    /** The board element whose column sentinels are observed. */
    boardRef: RefObject<HTMLDivElement | null>;
    /** Fetches the next page of one column; a no-op when there is none left. */
    loadMore: (columnValue: string) => Promise<void>;
    /** Column values joined, so a column set change re-observes the sentinels. */
    columnLayoutKey: string;
    sortableEpoch: number;
};

/**
 * Infinite scroll of the kanban columns: one IntersectionObserver per column
 * sentinel, inside that column's scroll container, fetching the next page as
 * the sentinel comes into view.
 */
export function useKanbanColumnPaging({
    boardRef,
    loadMore,
    columnLayoutKey,
    sortableEpoch,
}: UseKanbanColumnPagingOptions): void {
    useEffect(() => {
        if (!boardRef.current) {
            return;
        }

        const lists = Array.from(
            boardRef.current.querySelectorAll<HTMLElement>(
                '[data-kanban-column]',
            ),
        );
        const observers: IntersectionObserver[] = [];

        for (const list of lists) {
            const sentinel = list.querySelector<HTMLElement>(
                '[data-kanban-sentinel]',
            );

            if (!sentinel) {
                continue;
            }

            const observer = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (!entry.isIntersecting) {
                            continue;
                        }

                        const value =
                            (entry.target as HTMLElement).dataset.columnValue ??
                            '';
                        void loadMore(value);
                    }
                },
                { root: list, rootMargin: '40px', threshold: 0 },
            );
            observer.observe(sentinel);
            observers.push(observer);
        }

        return () => {
            for (const observer of observers) {
                observer.disconnect();
            }
        };
    }, [boardRef, loadMore, columnLayoutKey, sortableEpoch]);
}
