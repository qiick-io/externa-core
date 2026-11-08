import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    DataTable,
    dataTableExpandColumn,
} from '@/components/admin/data-table';
import { DataTableFacetedFilter } from '@/components/admin/data-table-faceted-filter';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { TableCellLine } from '@/components/admin/table-cell-line';
import { TruncatedText } from '@/components/admin/truncated-text';
import { UserMultiSelect } from '@/components/admin/user-multi-select';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import { FilterSearch } from '@/components/layout/page-header';
import { PageLayout } from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDebouncedServerSearch } from '@/hooks/use-debounced-server-search';
import AppLayout from '@/layouts/app-layout';
import { seedActivityLogPrompt } from '@/lib/ai-open';
import { listPerPageQuery, normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import activityLogsRoutes from '@/routes/activity-logs';
import type {
    AdminActivityLogRow,
    AdminUserRow,
    BreadcrumbItem,
    Paginated,
} from '@/types';

type Filters = {
    search?: string;
    user_ids?: number[];
    user_id?: number | null;
    event?: string;
    log_name?: string;
    date_from?: string;
    date_to?: string;
};

function resolveInitialUserIds(filters: Filters): number[] {
    if (Array.isArray(filters.user_ids) && filters.user_ids.length > 0) {
        return filters.user_ids.map(Number).filter((id) => id > 0);
    }

    if (filters.user_id) {
        return [Number(filters.user_id)];
    }

    return [];
}

/**
 * Searchable activity log for administrators.
 */
export default function AdminActivityLogsIndex({
    activityLogs: activityLogsProp,
    users: usersProp,
    events = [],
    logNames = ['default', 'auth', 'ai', 'chat', 'settings'],
    filters = {},
    exportRowLimit = 10000,
}: {
    activityLogs:
        LaravelPaginated<AdminActivityLogRow> | Paginated<AdminActivityLogRow>;
    users: Array<
        Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>
    >;
    events?: string[];
    logNames?: string[];
    filters?: Filters;
    exportRowLimit?: number;
}) {
    const { t } = useTranslation();
    const activityLogs = normalizePaginated(activityLogsProp);
    const users = useMemo(() => usersProp ?? [], [usersProp]);
    const [search, setSearch] = useState(filters.search ?? '');
    const [userIds, setUserIds] = useState<number[]>(() =>
        resolveInitialUserIds(filters),
    );
    const [event, setEvent] = useState(filters.event ?? '');
    const [logName, setLogName] = useState(filters.log_name ?? '');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo] = useState(filters.date_to ?? '');

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('activityLog.title'),
                href: activityLogsRoutes.index.url(),
            },
        ],
        [t],
    );

    const visit = useCallback(
        (overrides: Partial<Filters> = {}) => {
            const nextUserIds =
                overrides.user_ids !== undefined ? overrides.user_ids : userIds;
            const nextSearch =
                overrides.search !== undefined ? overrides.search : search;
            const nextEvent =
                overrides.event !== undefined ? overrides.event : event;
            const nextLogName =
                overrides.log_name !== undefined ? overrides.log_name : logName;
            const nextDateFrom =
                overrides.date_from !== undefined
                    ? overrides.date_from
                    : dateFrom;
            const nextDateTo =
                overrides.date_to !== undefined ? overrides.date_to : dateTo;

            router.get(
                activityLogsRoutes.index.url({
                    query: {
                        search: nextSearch || undefined,
                        user_ids:
                            nextUserIds && nextUserIds.length > 0
                                ? nextUserIds
                                : undefined,
                        event: nextEvent || undefined,
                        log_name: nextLogName || undefined,
                        date_from: nextDateFrom || undefined,
                        date_to: nextDateTo || undefined,
                        per_page: listPerPageQuery(activityLogs.per_page),
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [
            search,
            userIds,
            event,
            logName,
            dateFrom,
            dateTo,
            activityLogs.per_page,
        ],
    );

    const exportHref = useCallback(
        (format: 'csv' | 'json') =>
            activityLogsRoutes.export.url({
                query: {
                    format,
                    search: search || undefined,
                    user_ids:
                        userIds && userIds.length > 0 ? userIds : undefined,
                    event: event || undefined,
                    log_name: logName || undefined,
                    date_from: dateFrom || undefined,
                    date_to: dateTo || undefined,
                },
            }),
        [search, userIds, event, logName, dateFrom, dateTo],
    );

    const onDebouncedSearch = useCallback(
        (value: string): void => {
            visit({ search: value || undefined });
        },
        [visit],
    );

    useDebouncedServerSearch(search, filters.search ?? '', onDebouncedSearch);

    const formatDate = (value: string): string =>
        new Date(value).toLocaleString();

    const eventLabel = (eventName: string | null | undefined): string => {
        if (!eventName) {
            return '—';
        }

        return t(`activityLog.events.${eventName}`, {
            defaultValue: eventName,
        });
    };

    const logNameLabel = (name: string): string =>
        t(`activityLog.logs.${name}`, { defaultValue: name });

    const renderChanges = (row: AdminActivityLogRow): string => {
        const hasChanges = row.changes && Object.keys(row.changes).length > 0;
        const meta = row.properties?.meta ?? {};
        const hasMeta = Object.keys(meta).length > 0;

        if (!hasChanges && !hasMeta) {
            return t('activityLog.noChanges');
        }

        if (hasChanges && hasMeta) {
            return JSON.stringify({ changes: row.changes, meta }, null, 2);
        }

        return JSON.stringify(hasChanges ? row.changes : meta, null, 2);
    };

    const initialSelectedUsers = useMemo(() => {
        if (userIds.length === 0) {
            return [];
        }

        return users.filter((user) => userIds.includes(user.id));
    }, [users, userIds]);

    const columns: ColumnDef<AdminActivityLogRow>[] = [
        dataTableExpandColumn<AdminActivityLogRow>({
            expandLabel: t('activityLog.expand'),
            collapseLabel: t('activityLog.collapse'),
        }),
        {
            id: 'date',
            header: t('activityLog.columns.date'),
            meta: { cellClassName: 'text-sm whitespace-nowrap tabular-nums' },
            cell: ({ row }) => formatDate(row.original.created_at),
        },
        {
            id: 'user',
            header: t('activityLog.columns.user'),
            cell: ({ row }) =>
                row.original.causer ? (
                    <TableCellLine
                        className="max-w-56 text-sm"
                        primary={row.original.causer.name}
                        secondary={row.original.causer.email}
                    />
                ) : (
                    <span className="text-sm text-muted-foreground">
                        {t('activityLog.system')}
                    </span>
                ),
        },
        {
            id: 'action',
            header: t('activityLog.columns.action'),
            cell: ({ row }) => (
                <Badge variant="secondary">
                    {eventLabel(row.original.event)}
                </Badge>
            ),
        },
        {
            id: 'description',
            header: t('activityLog.columns.description'),
            meta: { cellClassName: 'max-w-xs text-sm' },
            cell: ({ row }) => (
                <TruncatedText text={row.original.description || '—'} />
            ),
        },
        {
            id: 'subject',
            header: t('activityLog.columns.subject'),
            meta: { cellClassName: 'max-w-xs text-sm' },
            cell: ({ row }) => (
                <TruncatedText
                    text={
                        row.original.subject
                            ? `${row.original.subject.type} ${row.original.subject.label}`
                            : '—'
                    }
                />
            ),
        },
        {
            id: 'actions',
            header: t('activityLog.columns.actions'),
            meta: {
                headerClassName: 'w-[1%] text-right',
                cellClassName: 'text-right',
            },
            cell: ({ row }) => (
                <AskAiButton
                    prompt={seedActivityLogPrompt({
                        id: row.original.id,
                        description: row.original.description,
                        event: row.original.event,
                    })}
                />
            ),
        },
    ];

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            headerActions={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline">
                            <Download aria-hidden="true" />
                            {t('common.export')}
                            <ChevronDown aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-w-64">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            {t('activityLog.exportHint', {
                                limit: exportRowLimit,
                            })}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <a href={exportHref('json')}>
                                <FileJson aria-hidden="true" />
                                {t('activityLog.exportJson')}
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <a href={exportHref('csv')}>
                                <FileSpreadsheet aria-hidden="true" />
                                {t('activityLog.exportCsv')}
                            </a>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            }
        >
            <Head title={t('activityLog.title')} />

            <PageLayout
                filters={
                    <div className="@container w-full min-w-0">
                        <div
                            data-testid="activity-log-filters"
                            className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5"
                        >
                            <FilterSearch
                                value={search}
                                onChange={setSearch}
                                placeholder={t('activityLog.searchPlaceholder')}
                                className="min-w-0 sm:max-w-none"
                            />
                            <UserMultiSelect
                                value={userIds}
                                onChange={(next) => {
                                    setUserIds(next);
                                    visit({ user_ids: next });
                                }}
                                placeholder={t('activityLog.allUsers')}
                                aria-label={t('activityLog.columns.user')}
                                initialUsers={initialSelectedUsers}
                                className="h-auto min-h-control min-w-0"
                            />
                            <DataTableFacetedFilter
                                title={t('activityLog.columns.action')}
                                ariaLabel={t('activityLog.filterByAction')}
                                isMultiple={false}
                                className="w-full min-w-0"
                                options={events.map((eventName) => ({
                                    value: eventName,
                                    label: eventLabel(eventName),
                                }))}
                                selectedValues={event ? [event] : []}
                                onSelectedValuesChange={([nextEvent = '']) => {
                                    setEvent(nextEvent);
                                    visit({ event: nextEvent || undefined });
                                }}
                            />
                            <DataTableFacetedFilter
                                title={t('activityLog.logName')}
                                ariaLabel={t('activityLog.filterByLog')}
                                isMultiple={false}
                                className="w-full min-w-0"
                                options={logNames.map((name) => ({
                                    value: name,
                                    label: logNameLabel(name),
                                }))}
                                selectedValues={logName ? [logName] : []}
                                onSelectedValuesChange={([
                                    nextLogName = '',
                                ]) => {
                                    setLogName(nextLogName);
                                    visit({
                                        log_name: nextLogName || undefined,
                                    });
                                }}
                            />
                            <DateRangePicker
                                dataTest="activity-log-date-range"
                                value={{ from: dateFrom, to: dateTo }}
                                onChange={(range) => {
                                    setDateFrom(range.from);
                                    setDateTo(range.to);
                                    visit({
                                        date_from: range.from,
                                        date_to: range.to,
                                    });
                                }}
                                placeholder={t('activityLog.anyDate')}
                                clearLabel={t('activityLog.clearDates')}
                                aria-label={t('activityLog.dateRange')}
                            />
                        </div>
                    </div>
                }
            >
                <DataTable
                    columns={columns}
                    data={activityLogs.data ?? []}
                    getRowId={(row) => String(row.id)}
                    pagination={activityLogs}
                    renderExpandedRow={(row) => (
                        <div className="space-y-3 py-2">
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                                <div>
                                    <span className="text-muted-foreground">
                                        {t('activityLog.logName')}:
                                    </span>{' '}
                                    {logNameLabel(row.log_name ?? 'default')}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        {t('activityLog.ip')}:
                                    </span>{' '}
                                    {row.properties.ip ?? '—'}
                                </div>
                            </div>
                            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                                {renderChanges(row)}
                            </pre>
                        </div>
                    )}
                    emptyState={
                        <span className="text-muted-foreground">
                            {t('activityLog.empty')}
                        </span>
                    }
                />
            </PageLayout>
        </AppLayout>
    );
}
