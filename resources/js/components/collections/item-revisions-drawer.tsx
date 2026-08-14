import { router } from '@inertiajs/react';
import { History } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RevisionSnapshot } from '@/components/collections/item-revision-compare-modal';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { jsonRequestHeaders } from '@/lib/csrf';
import { cn } from '@/lib/utils';

type RevisionsMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    has_more: boolean;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    collectionId: number;
    itemId: number;
    onSelectRevision: (revision: RevisionSnapshot, all: RevisionSnapshot[]) => void;
};

/**
 * Revisions list drawer opened from the item form header.
 */
export function ItemRevisionsDrawer({
    open,
    onOpenChange,
    collectionId,
    itemId,
    onSelectRevision,
}: Props) {
    const [revisions, setRevisions] = useState<RevisionSnapshot[]>([]);
    const [meta, setMeta] = useState<RevisionsMeta | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [appliedFrom, setAppliedFrom] = useState('');
    const [appliedTo, setAppliedTo] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hardRestoreId, setHardRestoreId] = useState<number | null>(null);
    const [restoring, setRestoring] = useState(false);
    const revisionsRef = useRef(revisions);

    useEffect(() => {
        revisionsRef.current = revisions;
    });

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

            setError(null);

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
                `/collections/${collectionId}/items/${itemId}/revisions?${params}`,
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
                        revisions?: RevisionSnapshot[];
                        meta?: RevisionsMeta;
                    };
                    const next = Array.isArray(payload.revisions)
                        ? payload.revisions
                        : [];
                    setRevisions((prev) => (append ? [...prev, ...next] : next));
                    setMeta(payload.meta ?? null);
                })
                .catch(() => {
                    setError('Could not load revisions.');

                    if (!append) {
                        setRevisions([]);
                        setMeta(null);
                    }
                })
                .finally(() => {
                    setLoading(false);
                    setLoadingMore(false);
                });
        },
        [collectionId, itemId],
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        setDateFrom('');
        setDateTo('');
        setAppliedFrom('');
        setAppliedTo('');
        fetchPage(1, { date_from: '', date_to: '' }, false);
    }, [open, fetchPage]);

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
        if (!meta?.has_more || loading || loadingMore) {
            return;
        }

        fetchPage(
            meta.current_page + 1,
            { date_from: appliedFrom, date_to: appliedTo },
            true,
        );
    };

    const hardRestore = (revisionId: number): void => {
        setRestoring(true);
        router.post(
            `/collections/${collectionId}/items/${itemId}/revisions/${revisionId}/restore`,
            {},
            {
                onFinish: () => setRestoring(false),
                onSuccess: () => {
                    setHardRestoreId(null);
                    onOpenChange(false);
                },
                onError: () => setHardRestoreId(null),
            },
        );
    };

    const filterActive = appliedFrom !== '' || appliedTo !== '';

    return (
        <>
            <Drawer open={open} onOpenChange={onOpenChange} direction="right">
                <DrawerContent
                    data-test="item-revisions-drawer"
                    className="data-[vaul-drawer-direction=right]:max-w-md"
                >
                    <DrawerHeader>
                        <DrawerTitle className="flex items-center gap-2">
                            <History className="size-4" />
                            Revisions
                        </DrawerTitle>
                        <DrawerDescription>
                            Select a revision to compare with the current item.
                            Apply merges into the form — Save to keep.
                        </DrawerDescription>
                    </DrawerHeader>
                    <DrawerBody className="space-y-3">
                        <div className="space-y-2 rounded-xl border border-sidebar-border/70 p-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label htmlFor="revision-date-from">
                                        From
                                    </Label>
                                    <Input
                                        id="revision-date-from"
                                        type="date"
                                        value={dateFrom}
                                        onChange={(event) =>
                                            setDateFrom(event.target.value)
                                        }
                                        className="h-9"
                                        aria-label="From date"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="revision-date-to">To</Label>
                                    <Input
                                        id="revision-date-to"
                                        type="date"
                                        value={dateTo}
                                        min={dateFrom || undefined}
                                        onChange={(event) =>
                                            setDateTo(event.target.value)
                                        }
                                        className="h-9"
                                        aria-label="To date"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={applyFilter}
                                    disabled={loading}
                                >
                                    Filter
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={clearFilter}
                                    disabled={loading || !filterActive}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>

                        {loading ? (
                            <p className="text-sm text-muted-foreground">
                                Loading…
                            </p>
                        ) : null}
                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : null}
                        {!loading && !error && revisions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {filterActive
                                    ? 'No revisions for this date range.'
                                    : 'No revisions yet.'}
                            </p>
                        ) : null}
                        <ul className="divide-y rounded-xl border border-sidebar-border/70">
                            {revisions.map((revision) => (
                                <li
                                    key={revision.id}
                                    className="flex items-start gap-2 px-3 py-2.5"
                                >
                                    <button
                                        type="button"
                                        className={cn(
                                            'flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left text-sm',
                                            'hover:text-foreground',
                                        )}
                                        data-test={`revision-row-${revision.id}`}
                                        onClick={() =>
                                            onSelectRevision(
                                                revision,
                                                revisionsRef.current,
                                            )
                                        }
                                    >
                                        <span className="font-medium">
                                            #{revision.id}
                                            {revision.summary
                                                ? ` · ${revision.summary}`
                                                : ''}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {revision.created_at
                                                ? new Date(
                                                      revision.created_at,
                                                  ).toLocaleString()
                                                : '—'}{' '}
                                            · {revision.user?.name ?? 'System'}
                                        </span>
                                    </button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="shrink-0 text-xs text-muted-foreground"
                                        title="Hard restore (writes immediately)"
                                        data-test={`hard-restore-${revision.id}`}
                                        onClick={() =>
                                            setHardRestoreId(revision.id)
                                        }
                                    >
                                        Hard
                                    </Button>
                                </li>
                            ))}
                        </ul>
                        {meta?.has_more ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                disabled={loading || loadingMore}
                                onClick={loadMore}
                            >
                                {loadingMore ? 'Loading…' : 'Load more'}
                            </Button>
                        ) : null}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>

            <ConfirmDestructiveDialog
                open={hardRestoreId !== null}
                onOpenChange={(next) => {
                    if (!next) {
                        setHardRestoreId(null);
                    }
                }}
                title="Hard restore this revision?"
                description="Current published values will be overwritten immediately. Prefer Compare → Apply for soft restore."
                confirmLabel="Hard restore"
                confirming={restoring}
                onConfirm={() => {
                    if (hardRestoreId === null) {
                        return;
                    }

                    hardRestore(hardRestoreId);
                }}
            />
        </>
    );
}
