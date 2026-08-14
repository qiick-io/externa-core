import { Head, Link, router } from '@inertiajs/react';
import { useCallback, useMemo, useState } from 'react';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { jsonRequestHeaders } from '@/lib/csrf';
import collections from '@/routes/collections';
import type { BreadcrumbItem } from '@/types';

type RevisionRow = {
    id: number;
    user: { id: number; name: string } | null;
    created_at: string | null;
    meta: Record<string, unknown> | null;
    data: Record<string, unknown>;
    summary?: string;
};

type RevisionsMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    has_more: boolean;
};

/**
 * Item revision history with compare and restore.
 */
export default function ItemRevisions({
    collection,
    item,
    revisions: initialRevisions,
    meta: initialMeta,
    filters: initialFilters,
}: {
    collection: { id: number; name: string; slug: string };
    item: { id: number };
    revisions: RevisionRow[];
    meta: RevisionsMeta;
    filters: { date_from: string; date_to: string };
}) {
    const [revisions, setRevisions] = useState(initialRevisions);
    const [meta, setMeta] = useState(initialMeta);
    const [dateFrom, setDateFrom] = useState(initialFilters.date_from ?? '');
    const [dateTo, setDateTo] = useState(initialFilters.date_to ?? '');
    const [appliedFrom, setAppliedFrom] = useState(
        initialFilters.date_from ?? '',
    );
    const [appliedTo, setAppliedTo] = useState(initialFilters.date_to ?? '');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected] = useState<number[]>(
        initialRevisions.slice(0, 2).map((r) => r.id),
    );
    const [restoreRevisionId, setRestoreRevisionId] = useState<number | null>(
        null,
    );
    const [restoring, setRestoring] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Collections', href: collections.index.url() },
        {
            title: collection.name,
            href: collections.items.index.url(collection.id),
        },
        {
            title: `Item #${item.id}`,
            href: collections.items.show.url({
                collection: collection.id,
                item: item.id,
            }),
        },
        {
            title: 'History',
            href: `/collections/${collection.id}/items/${item.id}/revisions`,
        },
    ];

    const fetchPage = useCallback(
        (
            page: number,
            filters: { date_from: string; date_to: string },
            append: boolean,
        ): void => {
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const params = new URLSearchParams({
                json: '1',
                page: String(page),
            });

            if (filters.date_from) {
                params.set('date_from', filters.date_from);
            }

            if (filters.date_to) {
                params.set('date_to', filters.date_to);
            }

            void fetch(
                `/collections/${collection.id}/items/${item.id}/revisions?${params}`,
                {
                    headers: {
                        ...jsonRequestHeaders(),
                        Accept: 'application/json',
                    },
                    credentials: 'same-origin',
                },
            )
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const payload = (await response.json()) as {
                        revisions?: RevisionRow[];
                        meta?: RevisionsMeta;
                    };
                    const next = Array.isArray(payload.revisions)
                        ? payload.revisions
                        : [];
                    setRevisions((prev) => (append ? [...prev, ...next] : next));
                    setMeta(
                        payload.meta ?? {
                            current_page: page,
                            last_page: page,
                            per_page: 20,
                            total: next.length,
                            has_more: false,
                        },
                    );

                    if (!append) {
                        setSelected(next.slice(0, 2).map((r) => r.id));
                    }
                })
                .catch(() => {
                    if (!append) {
                        setRevisions([]);
                        setSelected([]);
                    }
                })
                .finally(() => {
                    setLoading(false);
                    setLoadingMore(false);
                });
        },
        [collection.id, item.id],
    );

    const applyFilter = (): void => {
        setAppliedFrom(dateFrom);
        setAppliedTo(dateTo);
        fetchPage(1, { date_from: dateFrom, date_to: dateTo }, false);
    };

    const clearFilter = (): void => {
        setDateFrom('');
        setDateTo('');
        setAppliedFrom('');
        setAppliedTo('');
        fetchPage(1, { date_from: '', date_to: '' }, false);
    };

    const loadMore = (): void => {
        if (!meta.has_more || loading || loadingMore) {
            return;
        }

        fetchPage(
            meta.current_page + 1,
            { date_from: appliedFrom, date_to: appliedTo },
            true,
        );
    };

    const compared = useMemo(() => {
        if (selected.length < 2) {
            return null;
        }

        const a = revisions.find((r) => r.id === selected[0]);
        const b = revisions.find((r) => r.id === selected[1]);

        if (!a || !b) {
            return null;
        }

        const keys = Array.from(
            new Set([...Object.keys(a.data), ...Object.keys(b.data)]),
        ).sort();

        return keys.map((key) => ({
            key,
            left: JSON.stringify(a.data[key] ?? null),
            right: JSON.stringify(b.data[key] ?? null),
            changed:
                JSON.stringify(a.data[key] ?? null) !==
                JSON.stringify(b.data[key] ?? null),
        }));
    }, [revisions, selected]);

    const toggleSelect = (id: number): void => {
        setSelected((prev) => {
            if (prev.includes(id)) {
                return prev.filter((x) => x !== id);
            }

            if (prev.length >= 2) {
                return [prev[1], id];
            }

            return [...prev, id];
        });
    };

    const restore = (revisionId: number): void => {
        setRestoring(true);
        router.post(
            `/collections/${collection.id}/items/${item.id}/revisions/${revisionId}/restore`,
            {},
            {
                onFinish: () => setRestoring(false),
                onSuccess: () => setRestoreRevisionId(null),
                onError: () => setRestoreRevisionId(null),
            },
        );
    };

    const filterActive = appliedFrom !== '' || appliedTo !== '';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`History — Item #${item.id}`} />
            <PageLayout description="Select two revisions to compare. Restore writes a snapshot as a new update.">
                <div className="mb-4 flex flex-wrap items-end gap-3">
                    <Button variant="outline" asChild>
                        <Link
                            href={collections.items.show.url({
                                collection: collection.id,
                                item: item.id,
                            })}
                        >
                            Back to item
                        </Link>
                    </Button>
                    <div className="space-y-1">
                        <Label htmlFor="history-date-from">From</Label>
                        <Input
                            id="history-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(event) =>
                                setDateFrom(event.target.value)
                            }
                            className="h-9 w-auto"
                            aria-label="From date"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="history-date-to">To</Label>
                        <Input
                            id="history-date-to"
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={(event) => setDateTo(event.target.value)}
                            className="h-9 w-auto"
                            aria-label="To date"
                        />
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={applyFilter}
                        disabled={loading}
                    >
                        Filter
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={clearFilter}
                        disabled={loading || !filterActive}
                    >
                        Clear
                    </Button>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                        <h2 className="text-sm font-medium">Revisions</h2>
                        {loading ? (
                            <p className="text-sm text-muted-foreground">
                                Loading…
                            </p>
                        ) : null}
                        {!loading && revisions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {filterActive
                                    ? 'No revisions for this date range.'
                                    : 'No revisions yet.'}
                            </p>
                        ) : (
                            <>
                                <ul className="divide-y rounded-xl border border-sidebar-border/70">
                                    {revisions.map((revision) => {
                                        const active = selected.includes(
                                            revision.id,
                                        );

                                        return (
                                            <li
                                                key={revision.id}
                                                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                            >
                                                <button
                                                    type="button"
                                                    className="flex flex-1 flex-col items-start text-left"
                                                    onClick={() =>
                                                        toggleSelect(
                                                            revision.id,
                                                        )
                                                    }
                                                >
                                                    <span className="font-medium">
                                                        #{revision.id}
                                                        {active
                                                            ? ' · selected'
                                                            : ''}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {revision.created_at
                                                            ? new Date(
                                                                  revision.created_at,
                                                              ).toLocaleString()
                                                            : '—'}{' '}
                                                        ·{' '}
                                                        {revision.user?.name ??
                                                            'System'}
                                                    </span>
                                                </button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        setRestoreRevisionId(
                                                            revision.id,
                                                        )
                                                    }
                                                >
                                                    Restore
                                                </Button>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {meta.has_more ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        disabled={loading || loadingMore}
                                        onClick={loadMore}
                                    >
                                        {loadingMore
                                            ? 'Loading…'
                                            : 'Load more'}
                                    </Button>
                                ) : null}
                            </>
                        )}
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-sm font-medium">Compare</h2>
                        {!compared ? (
                            <p className="text-sm text-muted-foreground">
                                Select two revisions to see field diffs.
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-sidebar-border/70">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b bg-muted/40 text-left">
                                            <th className="p-2">Field</th>
                                            <th className="p-2">A</th>
                                            <th className="p-2">B</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {compared.map((row) => (
                                            <tr
                                                key={row.key}
                                                className={
                                                    row.changed
                                                        ? 'bg-amber-500/10'
                                                        : undefined
                                                }
                                            >
                                                <td className="p-2 font-medium">
                                                    {row.key}
                                                </td>
                                                <td className="p-2 font-mono break-all">
                                                    {row.left}
                                                </td>
                                                <td className="p-2 font-mono break-all">
                                                    {row.right}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </PageLayout>

            <ConfirmDestructiveDialog
                open={restoreRevisionId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRestoreRevisionId(null);
                    }
                }}
                title="Restore this revision?"
                description="Current values will be overwritten."
                confirmLabel="Restore"
                confirming={restoring}
                onConfirm={() => {
                    if (restoreRevisionId === null) {
                        return;
                    }

                    restore(restoreRevisionId);
                }}
            />
        </AppLayout>
    );
}
