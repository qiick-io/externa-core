import { Link, router } from '@inertiajs/react';
import { GripVertical, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createSortableList } from '@/lib/create-sortable-list';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type { CollectionView } from '@/types';
import type { QueryParams } from '@/wayfinder';

type ItemRow = {
    id: number;
    data: Record<string, unknown>;
    displays?: Record<string, string | null>;
    updated_at?: string | null;
    has_draft?: boolean;
    approval_status?: string | null;
};

export type KanbanColumnPage = {
    value: string;
    label: string;
    total: number;
    current_page: number;
    last_page: number;
    items: ItemRow[];
};

export type KanbanBoard = {
    field: string;
    per_page: number;
    columns: KanbanColumnPage[];
};

type ColumnState = KanbanColumnPage & {
    loading: boolean;
};

function itemTitle(row: ItemRow): string {
    const display = row.displays?.title;

    if (typeof display === 'string' && display.trim() !== '') {
        return display;
    }

    const raw = row.data?.title;

    if (typeof raw === 'string' && raw.trim() !== '') {
        return raw;
    }

    if (typeof raw === 'number') {
        return String(raw);
    }

    return `#${row.id}`;
}

function formatUpdatedAt(value: string | null | undefined): string | null {
    if (typeof value !== 'string' || value === '') {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function approvalLabel(status: string): string {
    if (status === 'in_review') {
        return 'In review';
    }

    if (status === 'approved') {
        return 'Approved';
    }

    if (status === 'rejected') {
        return 'Rejected';
    }

    return status;
}

function buildListQuery(filters: Record<string, unknown>): QueryParams {
    const query: QueryParams = {};
    const filter: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
        if (
            key === 'trashed' ||
            key === 'has_draft' ||
            key === 'in_review' ||
            key === 'sort' ||
            key === 'direction'
        ) {
            continue;
        }

        filter[key] = value;
    }

    if (Object.keys(filter).length > 0) {
        query.filter = filter as QueryParams['filter'];
    }

    if (filters.trashed === true) {
        query.trashed = true;
    }

    if (filters.has_draft === true) {
        query.has_draft = true;
    }

    if (filters.in_review === true) {
        query.in_review = true;
    }

    if (typeof filters.sort === 'string' && filters.sort !== '') {
        query.sort = filters.sort;
    }

    if (filters.direction === 'asc' || filters.direction === 'desc') {
        query.direction = filters.direction;
    }

    return query;
}

/**
 * Put Sortable-moved cards back under pre-drag parents/order so React can
 * reconcile without removeChild NotFoundError, then setState to the new board.
 */
function restoreKanbanDom(
    boardEl: HTMLElement,
    columns: readonly ColumnState[],
): void {
    const cards = new Map<number, HTMLElement>();

    for (const card of boardEl.querySelectorAll('[data-kanban-card]')) {
        if (!(card instanceof HTMLElement)) {
            continue;
        }

        const id = Number(card.dataset.itemId);

        if (Number.isFinite(id)) {
            cards.set(id, card);
        }
    }

    for (const column of columns) {
        const list = boardEl.querySelector(
            `[data-kanban-column][data-column-value="${CSS.escape(column.value)}"]`,
        );

        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (
                child instanceof HTMLElement &&
                child.hasAttribute('data-kanban-card')
            ) {
                child.remove();
            }
        }

        const sentinel = list.querySelector('[data-kanban-sentinel]');

        for (const item of column.items) {
            const card = cards.get(item.id);

            if (!card) {
                continue;
            }

            if (sentinel) {
                list.insertBefore(card, sentinel);
            } else {
                list.appendChild(card);
            }
        }
    }
}

/**
 * Kanban board with per-column pagination. Drag updates via item PUT.
 */
export function ItemsKanban({
    collection,
    board,
    filters,
    canEdit,
    isTrashed,
}: {
    collection: CollectionView;
    board: KanbanBoard | null;
    filters: Record<string, unknown>;
    canEdit: boolean;
    isTrashed: boolean;
}) {
    const { t } = useTranslation();
    const boardRef = useRef<HTMLDivElement | null>(null);
    const versioningEnabled = Boolean(collection.versioning);
    const approvalsRequired = Boolean(collection.approvals_required);
    const fieldName = board?.field ?? null;
    const perPage = board?.per_page ?? 30;

    const [columns, setColumns] = useState<ColumnState[]>(() =>
        (board?.columns ?? []).map((column) => ({
            ...column,
            loading: false,
        })),
    );
    // Bump after onEnd destroy so Sortable remounts on a React-owned tree.
    const [sortableEpoch, setSortableEpoch] = useState(0);
    const columnsRef = useRef(columns);
    columnsRef.current = columns;

    useEffect(() => {
        setColumns(
            (board?.columns ?? []).map((column) => ({
                ...column,
                loading: false,
            })),
        );
        setSortableEpoch((epoch) => epoch + 1);
    }, [board]);

    const listQuery = useMemo(() => buildListQuery(filters), [filters]);

    const loadMore = useCallback(
        async (columnValue: string) => {
            if (!fieldName) {
                return;
            }

            const column = columnsRef.current.find(
                (entry) => entry.value === columnValue,
            );

            if (
                !column ||
                column.loading ||
                column.current_page >= column.last_page
            ) {
                return;
            }

            const nextPage = column.current_page + 1;
            setColumns((current) =>
                current.map((entry) =>
                    entry.value === columnValue
                        ? { ...entry, loading: true }
                        : entry,
                ),
            );

            try {
                const url = ItemController.kanbanColumn.url(collection.id, {
                    query: {
                        ...listQuery,
                        field: fieldName,
                        value: columnValue,
                        page: nextPage,
                        per_page: perPage,
                    },
                });
                const response = await fetch(url, {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error('kanban column fetch failed');
                }

                const payload = (await response.json()) as {
                    data?: ItemRow[];
                    current_page?: number;
                    last_page?: number;
                    total?: number;
                };
                const rows = Array.isArray(payload.data) ? payload.data : [];

                setColumns((current) =>
                    current.map((entry) => {
                        if (entry.value !== columnValue) {
                            return entry;
                        }

                        const seen = new Set(
                            entry.items.map((item) => item.id),
                        );
                        const appended = rows.filter(
                            (item) => !seen.has(item.id),
                        );

                        return {
                            ...entry,
                            loading: false,
                            current_page:
                                typeof payload.current_page === 'number'
                                    ? payload.current_page
                                    : entry.current_page,
                            last_page:
                                typeof payload.last_page === 'number'
                                    ? payload.last_page
                                    : entry.last_page,
                            total:
                                typeof payload.total === 'number'
                                    ? payload.total
                                    : entry.total,
                            items: [...entry.items, ...appended],
                        };
                    }),
                );
            } catch {
                setColumns((current) =>
                    current.map((entry) =>
                        entry.value === columnValue
                            ? { ...entry, loading: false }
                            : entry,
                    ),
                );
            }
        },
        [collection.id, fieldName, listQuery, perPage],
    );

    // Remount Sortable when column set / edit mode changes — not on every card move.
    const columnLayoutKey = columns.map((column) => column.value).join('|');

    useEffect(() => {
        if (!boardRef.current || !canEdit || isTrashed || !fieldName) {
            return;
        }

        const boardEl = boardRef.current;
        const lists = Array.from(
            boardEl.querySelectorAll<HTMLElement>('[data-kanban-column]'),
        );
        const instances: ReturnType<typeof createSortableList>[] = [];

        const destroyAll = (): void => {
            for (const instance of instances) {
                instance.destroy();
            }

            instances.length = 0;
        };

        for (const list of lists) {
            instances.push(
                createSortableList(list, {
                    group: 'collection-kanban',
                    draggable: '[data-kanban-card]',
                    handle: '[data-kanban-handle]',
                    // Persist only onEnd — mid-drag setState remounts lists and
                    // races Sortable DOM (removeChild NotFoundError).
                    onEnd: (event) => {
                        const itemId = Number(
                            (event.item as HTMLElement).dataset.itemId,
                        );
                        const fromValue =
                            (event.from as HTMLElement).dataset.columnValue ??
                            '';
                        const nextValue =
                            (event.to as HTMLElement).dataset.columnValue ?? '';
                        const newIndex =
                            typeof event.newIndex === 'number'
                                ? event.newIndex
                                : 0;

                        destroyAll();
                        restoreKanbanDom(boardEl, columnsRef.current);

                        if (!Number.isFinite(itemId) || fieldName === null) {
                            setSortableEpoch((epoch) => epoch + 1);

                            return;
                        }

                        const snapshot = columnsRef.current;
                        let moved: ItemRow | null = null;
                        const without = snapshot.map((column) => {
                            const remaining = column.items.filter((item) => {
                                if (item.id === itemId) {
                                    moved = item;

                                    return false;
                                }

                                return true;
                            });

                            if (remaining.length === column.items.length) {
                                return column;
                            }

                            return {
                                ...column,
                                items: remaining,
                                total:
                                    fromValue === nextValue
                                        ? column.total
                                        : Math.max(0, column.total - 1),
                            };
                        });

                        if (moved === null) {
                            setSortableEpoch((epoch) => epoch + 1);

                            return;
                        }

                        const target = without.find(
                            (column) => column.value === nextValue,
                        );
                        const insertAt = Math.max(
                            0,
                            Math.min(newIndex, target?.items.length ?? 0),
                        );
                        const nextItems = [
                            ...(target?.items.slice(0, insertAt) ?? []),
                            moved,
                            ...(target?.items.slice(insertAt) ?? []),
                        ];
                        const afterItemId =
                            insertAt > 0
                                ? (nextItems[insertAt - 1]?.id ?? null)
                                : null;
                        const beforeItemId =
                            insertAt < nextItems.length - 1
                                ? (nextItems[insertAt + 1]?.id ?? null)
                                : null;

                        setColumns(
                            without.map((column) => {
                                if (column.value !== nextValue) {
                                    return column;
                                }

                                return {
                                    ...column,
                                    items: nextItems,
                                    total:
                                        fromValue === nextValue
                                            ? column.total
                                            : column.total + 1,
                                };
                            }),
                        );
                        setSortableEpoch((epoch) => epoch + 1);

                        router.put(
                            ItemController.update.url({
                                collection: collection.id,
                                item: itemId,
                            }),
                            {
                                data: {
                                    [fieldName]:
                                        nextValue === '' ? null : nextValue,
                                },
                                board_move: true,
                                after_item_id: afterItemId,
                                before_item_id: beforeItemId,
                                save_action: 'stay',
                                return: currentPathWithQuery(),
                            },
                            { preserveScroll: true },
                        );
                    },
                }),
            );
        }

        return destroyAll;
    }, [
        canEdit,
        collection.id,
        collection.versioning,
        columnLayoutKey,
        fieldName,
        isTrashed,
        sortableEpoch,
    ]);

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
    }, [loadMore, columnLayoutKey, sortableEpoch]);

    if (!board || !fieldName) {
        return (
            <p
                className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
                data-test="kanban-missing-field"
            >
                {t('collections.itemsList.kanbanMissingField')}
            </p>
        );
    }

    return (
        <div
            ref={boardRef}
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden"
            data-test="items-kanban"
            data-kanban-per-page={perPage}
        >
            {columns.map((column) => {
                const hasMore = column.current_page < column.last_page;

                return (
                    <section
                        key={column.value || '__empty'}
                        className="flex min-h-0 min-w-[18.75rem] flex-1 shrink-0 flex-col rounded-lg border bg-muted/20 sm:min-w-[20rem]"
                        data-test={`kanban-column-${column.value || 'empty'}`}
                    >
                        <header className="shrink-0 border-b px-3 py-2 text-sm font-medium">
                            {column.label}
                            <span
                                className="ml-2 text-xs text-muted-foreground"
                                data-test={`kanban-column-count-${column.value || 'empty'}`}
                            >
                                {column.total}
                            </span>
                        </header>
                        <ul
                            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
                            data-kanban-column
                            data-column-value={column.value}
                        >
                            {column.items.map((item) => {
                                const updated = formatUpdatedAt(
                                    item.updated_at,
                                );
                                const showDraft =
                                    versioningEnabled &&
                                    item.has_draft === true;
                                const approvalStatus =
                                    typeof item.approval_status === 'string'
                                        ? item.approval_status
                                        : null;
                                const showApproval =
                                    approvalsRequired &&
                                    approvalStatus !== null &&
                                    approvalStatus !== '' &&
                                    approvalStatus !== 'draft';

                                return (
                                    <li
                                        key={item.id}
                                        data-kanban-card
                                        data-item-id={item.id}
                                        className="rounded-md border bg-background p-2.5 shadow-xs"
                                    >
                                        <div className="flex items-start gap-2">
                                            {canEdit && !isTrashed ? (
                                                <button
                                                    type="button"
                                                    data-kanban-handle
                                                    className="mt-0.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                                                    aria-label="Drag"
                                                >
                                                    <GripVertical className="size-3.5" />
                                                </button>
                                            ) : null}
                                            <div className="min-w-0 flex-1 space-y-1.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <Link
                                                        href={withReturnParam(
                                                            collections.items.show.url(
                                                                {
                                                                    collection:
                                                                        collection.id,
                                                                    item: item.id,
                                                                },
                                                            ),
                                                            currentPathWithQuery(),
                                                        )}
                                                        className="min-w-0 flex-1 text-sm leading-snug font-medium hover:underline"
                                                    >
                                                        {itemTitle(item)}
                                                    </Link>
                                                    {showDraft ? (
                                                        <Badge
                                                            variant="secondary"
                                                            className="shrink-0 text-[10px]"
                                                            data-test={`kanban-draft-badge-${item.id}`}
                                                        >
                                                            Draft
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                                    <span className="tabular-nums">
                                                        #{item.id}
                                                    </span>
                                                    {updated ? (
                                                        <span>
                                                            Updated {updated}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {showApproval &&
                                                approvalStatus !== null ? (
                                                    <Badge
                                                        variant={
                                                            approvalStatus ===
                                                            'rejected'
                                                                ? 'destructive'
                                                                : 'outline'
                                                        }
                                                        className="text-[10px]"
                                                        data-test={`kanban-approval-badge-${item.id}`}
                                                    >
                                                        {approvalLabel(
                                                            approvalStatus,
                                                        )}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                            {hasMore ? (
                                <li
                                    className="list-none"
                                    data-kanban-sentinel
                                    data-column-value={column.value}
                                    aria-hidden
                                />
                            ) : null}
                        </ul>
                        {hasMore ? (
                            <div className="shrink-0 border-t p-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    disabled={column.loading}
                                    data-test={`kanban-load-more-${column.value || 'empty'}`}
                                    onClick={() => void loadMore(column.value)}
                                >
                                    {column.loading ? (
                                        <>
                                            <Loader2 className="size-3.5 animate-spin" />
                                            {t(
                                                'collections.itemsList.kanbanLoading',
                                            )}
                                        </>
                                    ) : (
                                        t(
                                            'collections.itemsList.kanbanLoadMore',
                                        )
                                    )}
                                </Button>
                            </div>
                        ) : null}
                    </section>
                );
            })}
        </div>
    );
}
