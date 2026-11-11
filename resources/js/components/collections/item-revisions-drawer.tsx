import { router } from '@inertiajs/react';
import { History } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemSeparator,
    ItemTitle,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { jsonRequestHeaders } from '@/lib/csrf';

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
    canRestore?: boolean;
    onSelectRevision: (
        revision: RevisionSnapshot,
        all: RevisionSnapshot[],
    ) => void;
};

/**
 * Revisions list drawer opened from the item form header.
 */
export function ItemRevisionsDrawer({
    open,
    onOpenChange,
    collectionId,
    itemId,
    canRestore = false,
    onSelectRevision,
}: Props) {
    const { t } = useTranslation();
    const [revisions, setRevisions] = useState<RevisionSnapshot[]>([]);
    const [meta, setMeta] = useState<RevisionsMeta | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [appliedFrom, setAppliedFrom] = useState('');
    const [appliedTo, setAppliedTo] = useState('');
    const [loading, setLoading] = useState(open);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hardRestoreId, setHardRestoreId] = useState<number | null>(null);
    const [restoring, setRestoring] = useState(false);
    const revisionsRef = useRef(revisions);

    useEffect(() => {
        revisionsRef.current = revisions;
    });

    /**
     * Network half of a page load: the caller has already flagged the loading
     * state, so the open effect below can start it without a synchronous setState.
     */
    const requestPage = useCallback(
        (
            page: number,
            filters: { date_from: string; date_to: string },
            append: boolean,
        ): void => {
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
                    setRevisions((prev) =>
                        append ? [...prev, ...next] : next,
                    );
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

    const fetchPage = (
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
        requestPage(page, filters, append);
    };

    const [previousOpenState, setPreviousOpenState] = useState({
        open,
        requestPage,
    });

    // Clear the filters and flag the first page as loading during render when
    // the drawer opens (React's "adjust state on prop change" pattern).
    if (
        previousOpenState.open !== open ||
        previousOpenState.requestPage !== requestPage
    ) {
        setPreviousOpenState({ open, requestPage });

        if (open) {
            setDateFrom('');
            setDateTo('');
            setAppliedFrom('');
            setAppliedTo('');
            setLoading(true);
            setError(null);
        }
    }

    useEffect(() => {
        if (!open) {
            return;
        }

        requestPage(1, { date_from: '', date_to: '' }, false);
    }, [open, requestPage]);

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
                            {t('revisions.title')}
                        </DrawerTitle>
                        <DrawerDescription>
                            {t('revisions.drawerDescription')}
                        </DrawerDescription>
                    </DrawerHeader>
                    <DrawerBody className="space-y-3">
                        <div className="space-y-2 rounded-xl border border-sidebar-border/70 p-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label htmlFor="revision-date-from">
                                        {t('common.from')}
                                    </Label>
                                    <Input
                                        id="revision-date-from"
                                        type="date"
                                        value={dateFrom}
                                        onChange={(event) =>
                                            setDateFrom(event.target.value)
                                        }
                                        aria-label={t('a11y.fromDate')}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="revision-date-to">
                                        {t('common.to')}
                                    </Label>
                                    <Input
                                        id="revision-date-to"
                                        type="date"
                                        value={dateTo}
                                        min={dateFrom || undefined}
                                        onChange={(event) =>
                                            setDateTo(event.target.value)
                                        }
                                        aria-label={t('a11y.toDate')}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={applyFilter}
                                    disabled={loading}
                                >
                                    {t('common.filter')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={clearFilter}
                                    disabled={loading || !filterActive}
                                >
                                    {t('common.clear')}
                                </Button>
                            </div>
                        </div>

                        {loading ? (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Spinner />
                                {t('common.loading')}
                            </p>
                        ) : null}
                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : null}
                        {!loading && !error && revisions.length === 0 ? (
                            <p
                                className="text-sm text-muted-foreground"
                                data-test="revisions-empty"
                            >
                                {filterActive
                                    ? t('revisions.emptyFiltered')
                                    : t('revisions.empty')}
                            </p>
                        ) : null}
                        {revisions.length > 0 ? (
                            <ItemGroup className="rounded-xl border border-sidebar-border/70">
                                {revisions.map((revision, index) => (
                                    <Fragment key={revision.id}>
                                        {index > 0 ? <ItemSeparator /> : null}
                                        <Item
                                            role="listitem"
                                            size="sm"
                                            className="relative rounded-none hover:bg-accent/50"
                                        >
                                            <ItemContent>
                                                <ItemTitle>
                                                    {/* Stretched button: the whole row picks the revision. */}
                                                    <button
                                                        type="button"
                                                        className="text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring"
                                                        data-test={`revision-row-${revision.id}`}
                                                        onClick={() =>
                                                            onSelectRevision(
                                                                revision,
                                                                revisionsRef.current,
                                                            )
                                                        }
                                                    >
                                                        #{revision.id}
                                                        {revision.summary
                                                            ? ` · ${revision.summary}`
                                                            : ''}
                                                    </button>
                                                </ItemTitle>
                                                <ItemDescription>
                                                    {revision.created_at
                                                        ? new Date(
                                                              revision.created_at,
                                                          ).toLocaleString()
                                                        : '—'}{' '}
                                                    ·{' '}
                                                    {revision.user?.name ??
                                                        t('common.system')}
                                                </ItemDescription>
                                            </ItemContent>
                                            {canRestore ? (
                                                <ItemActions className="relative">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                className="text-muted-foreground"
                                                                data-test={`hard-restore-${revision.id}`}
                                                                onClick={() =>
                                                                    setHardRestoreId(
                                                                        revision.id,
                                                                    )
                                                                }
                                                            >
                                                                {t(
                                                                    'revisions.hard',
                                                                )}
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {t(
                                                                'revisions.hardRestoreHint',
                                                            )}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </ItemActions>
                                            ) : null}
                                        </Item>
                                    </Fragment>
                                ))}
                            </ItemGroup>
                        ) : null}
                        {meta?.has_more ? (
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
                title={t('itemConfirm.hardRestoreRevisionTitle', {
                    name: `#${itemId}`,
                })}
                description={t('itemConfirm.hardRestoreRevisionDescription')}
                confirmLabel={t('revisions.hardRestore')}
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
