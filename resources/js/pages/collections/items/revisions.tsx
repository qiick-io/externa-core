import { Head, Link, router } from '@inertiajs/react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDestructiveDialog } from '@/components/confirm-destructive-dialog';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemSeparator,
    ItemTitle,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PermissionEnum } from '@/enums/permission-enum';
import { useCan } from '@/hooks/use-can';
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
    const { t } = useTranslation();
    const { can } = useCan();
    const canRestore = can(PermissionEnum.CanEditCollections);

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
                    setRevisions((prev) =>
                        append ? [...prev, ...next] : next,
                    );
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
            <Head title={t('revisions.pageTitle', { id: item.id })} />
            <PageLayout description={t('revisions.pageDescription')}>
                <div className="mb-4 flex flex-wrap items-end gap-3">
                    <Button variant="outline" asChild>
                        <Link
                            href={collections.items.show.url({
                                collection: collection.id,
                                item: item.id,
                            })}
                        >
                            {t('revisions.backToItem')}
                        </Link>
                    </Button>
                    <div className="space-y-1">
                        <Label htmlFor="history-date-from">
                            {t('common.from')}
                        </Label>
                        <Input
                            id="history-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(event) =>
                                setDateFrom(event.target.value)
                            }
                            className="w-auto"
                            aria-label={t('a11y.fromDate')}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="history-date-to">
                            {t('common.to')}
                        </Label>
                        <Input
                            id="history-date-to"
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={(event) => setDateTo(event.target.value)}
                            className="w-auto"
                            aria-label={t('a11y.toDate')}
                        />
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={applyFilter}
                        disabled={loading}
                    >
                        {t('common.filter')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={clearFilter}
                        disabled={loading || !filterActive}
                    >
                        {t('common.clear')}
                    </Button>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                        <h2 className="text-sm font-medium">
                            {t('revisions.title')}
                        </h2>
                        {loading ? (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Spinner />
                                {t('common.loading')}
                            </p>
                        ) : null}
                        {!loading && revisions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {filterActive
                                    ? t('revisions.emptyFiltered')
                                    : t('revisions.empty')}
                            </p>
                        ) : (
                            <>
                                <ItemGroup className="rounded-xl border border-sidebar-border/70">
                                    {revisions.map((revision, index) => {
                                        const active = selected.includes(
                                            revision.id,
                                        );
                                        const checkboxId = `revision-select-${revision.id}`;

                                        return (
                                            <Fragment key={revision.id}>
                                                {index > 0 ? (
                                                    <ItemSeparator />
                                                ) : null}
                                                <Item
                                                    role="listitem"
                                                    size="sm"
                                                    variant={
                                                        active
                                                            ? 'muted'
                                                            : 'default'
                                                    }
                                                    className="rounded-none"
                                                >
                                                    <ItemMedia>
                                                        <Checkbox
                                                            id={checkboxId}
                                                            checked={active}
                                                            onCheckedChange={() =>
                                                                toggleSelect(
                                                                    revision.id,
                                                                )
                                                            }
                                                            aria-label={t(
                                                                'revisions.selectRevision',
                                                                {
                                                                    id: revision.id,
                                                                },
                                                            )}
                                                        />
                                                    </ItemMedia>
                                                    <ItemContent>
                                                        <ItemTitle className="font-mono">
                                                            <label
                                                                htmlFor={
                                                                    checkboxId
                                                                }
                                                                className="cursor-pointer"
                                                            >
                                                                #{revision.id}
                                                            </label>
                                                        </ItemTitle>
                                                        <ItemDescription>
                                                            {revision.created_at
                                                                ? new Date(
                                                                      revision.created_at,
                                                                  ).toLocaleString()
                                                                : '—'}{' '}
                                                            ·{' '}
                                                            {revision.user
                                                                ?.name ??
                                                                t(
                                                                    'common.system',
                                                                )}
                                                        </ItemDescription>
                                                    </ItemContent>
                                                    {canRestore ? (
                                                        <ItemActions>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    setRestoreRevisionId(
                                                                        revision.id,
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'revisions.restore',
                                                                )}
                                                            </Button>
                                                        </ItemActions>
                                                    ) : null}
                                                </Item>
                                            </Fragment>
                                        );
                                    })}
                                </ItemGroup>
                                {meta.has_more ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        disabled={loading || loadingMore}
                                        onClick={loadMore}
                                    >
                                        {loadingMore ? <Spinner /> : null}
                                        {t('common.loadMore')}
                                    </Button>
                                ) : null}
                            </>
                        )}
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-sm font-medium">
                            {t('revisions.compare')}
                        </h2>
                        {!compared ? (
                            <p className="text-sm text-muted-foreground">
                                {t('revisions.compareHint')}
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl bg-card">
                                <Table className="text-xs">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('revisions.field')}
                                            </TableHead>
                                            <TableHead>A</TableHead>
                                            <TableHead>B</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {compared.map((row) => (
                                            <TableRow
                                                key={row.key}
                                                className={
                                                    row.changed
                                                        ? 'bg-warning/10'
                                                        : undefined
                                                }
                                            >
                                                <TableCell className="font-medium">
                                                    {row.key}
                                                </TableCell>
                                                <TableCell className="font-mono break-all">
                                                    {row.left}
                                                </TableCell>
                                                <TableCell className="font-mono break-all">
                                                    {row.right}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
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
                title={t('itemConfirm.restoreRevisionTitle', {
                    name: `#${item.id}`,
                })}
                description={t('itemConfirm.restoreRevisionDescription')}
                confirmLabel={t('revisions.restore')}
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
