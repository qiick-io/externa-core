import { router, usePage } from '@inertiajs/react';
import { History, ScrollText } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ITEM_VIEW_PARAM,
    withActivityViewParam,
} from '@/components/collections/item-form/item-form-helpers';
import type {
    ItemPayload,
    ItemView,
} from '@/components/collections/item-form/item-form-helpers';
import { TablePagination, TablePanel } from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { AdminActivityLogRow, Paginated } from '@/types';

/**
 * Activity view of an item: who created and last updated it, and its
 * paginated activity log (pagination links stay on `?view=activity`).
 */
export function ItemActivityPanel({
    item,
    activityLogs,
}: {
    item: ItemPayload;
    activityLogs: Paginated<AdminActivityLogRow> | null;
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-sidebar-border/70 bg-muted/30 p-4 text-sm dark:border-sidebar-border">
                <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>
                        <dt className="font-medium text-foreground">
                            {t('collections.columnPicker.createdBy')}
                        </dt>
                        <dd>{item.user_created?.name ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-medium text-foreground">
                            {t('collections.columnPicker.updatedBy')}
                        </dt>
                        <dd>{item.user_updated?.name ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className="font-medium text-foreground">
                            {t('collections.columnPicker.createdAt')}
                        </dt>
                        <dd>
                            {item.created_at
                                ? new Date(item.created_at).toLocaleString()
                                : '—'}
                        </dd>
                    </div>
                    <div>
                        <dt className="font-medium text-foreground">
                            {t('collections.columnPicker.updatedAt')}
                        </dt>
                        <dd>
                            {item.updated_at
                                ? new Date(item.updated_at).toLocaleString()
                                : '—'}
                        </dd>
                    </div>
                </dl>
            </div>
            <TablePanel
                footer={
                    activityLogs && activityLogs.last_page > 1 ? (
                        <TablePagination
                            links={withActivityViewParam(
                                activityLogs.links ?? [],
                            )}
                        />
                    ) : undefined
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>
                                {t('activityLog.columns.date')}
                            </TableHead>
                            <TableHead>
                                {t('activityLog.columns.user')}
                            </TableHead>
                            <TableHead>
                                {t('activityLog.columns.action')}
                            </TableHead>
                            <TableHead>
                                {t('activityLog.columns.description')}
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {activityLogs &&
                        (activityLogs.data ?? []).length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={4}
                                    className="text-muted-foreground"
                                >
                                    {t('collections.items.form.noActivity')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            (activityLogs?.data ?? []).map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="text-sm whitespace-nowrap tabular-nums">
                                        {row.created_at
                                            ? new Date(
                                                  row.created_at,
                                              ).toLocaleString()
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        {row.causer ? (
                                            <div className="text-sm">
                                                <div>{row.causer.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {row.causer.email}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">
                                                {t('activityLog.system')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">
                                            {row.event ?? '—'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate text-sm">
                                        {row.description}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TablePanel>
        </div>
    );
}

/**
 * Fields / activity switch of a saved item. The view lives in the `view`
 * query param, so activity pagination (its links keep the query string) and
 * back/forward stay on the chosen view. Client-side push, no request.
 */
export function ItemViewToggle({ activeTab }: { activeTab: ItemView }) {
    const { t } = useTranslation();
    const page = usePage();

    const selectItemView = useCallback(
        (view: ItemView) => {
            const nextUrl = new URL(page.url, window.location.origin);

            if (view === 'activity') {
                nextUrl.searchParams.set(ITEM_VIEW_PARAM, 'activity');
            } else {
                nextUrl.searchParams.delete(ITEM_VIEW_PARAM);
                nextUrl.searchParams.delete('page');
            }

            router.push({
                url: `${nextUrl.pathname}${nextUrl.search}`,
                preserveState: true,
                preserveScroll: true,
            });
        },
        [page.url],
    );

    return (
        <ToggleGroup
            type="single"
            variant="outline"
            value={activeTab}
            onValueChange={(value) => {
                if (value === 'fields' || value === 'activity') {
                    selectItemView(value);
                }
            }}
        >
            <ToggleGroupItem value="fields" aria-label={t('a11y.fieldsPanel')}>
                <ScrollText className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
                value="activity"
                aria-label={t('a11y.activityPanel')}
            >
                <History className="size-4" />
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
