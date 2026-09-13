import { Head, router } from '@inertiajs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TruncatedText } from '@/components/admin/truncated-text';
import { UserMultiSelect } from '@/components/admin/user-multi-select';
import { AskAiButton } from '@/components/ai/ask-ai-button';
import {
    FilterSearch,
    filterSelectClassName,
} from '@/components/layout/page-header';
import {
    PageLayout,
    TablePagination,
    TablePanel,
} from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import adminRoutes from '@/lib/admin-routes';
import { seedActivityLogPrompt } from '@/lib/ai-open';
import { normalizePaginated } from '@/lib/pagination';
import type { LaravelPaginated } from '@/lib/pagination';
import { cn } from '@/lib/utils';
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
}: {
    activityLogs:
        LaravelPaginated<AdminActivityLogRow> | Paginated<AdminActivityLogRow>;
    users: Array<
        Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>
    >;
    events?: string[];
    logNames?: string[];
    filters?: Filters;
}) {
    const { t } = useTranslation();
    const activityLogs = normalizePaginated(activityLogsProp);
    const users = usersProp ?? [];
    const [search, setSearch] = useState(filters.search ?? '');
    const [userIds, setUserIds] = useState<number[]>(() =>
        resolveInitialUserIds(filters),
    );
    const [event, setEvent] = useState(filters.event ?? '');
    const [logName, setLogName] = useState(filters.log_name ?? '');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo] = useState(filters.date_to ?? '');
    const [expandedIds, setExpandedIds] = useState<number[]>([]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('activityLog.title'),
                href: adminRoutes.activityLogs.index(),
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
                adminRoutes.activityLogs.index({
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
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [search, userIds, event, logName, dateFrom, dateTo],
    );

    useEffect(() => {
        // Only refetch when the user changes search. Mount / pagination remounts
        // leave search === filters.search; visiting without `page` would reset to page 1.
        if (search === (filters.search ?? '')) {
            return;
        }

        const timer = setTimeout(() => {
            visit({ search: search || undefined });
        }, 350);

        return () => clearTimeout(timer);
    }, [search, filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleExpanded = (id: number): void => {
        setExpandedIds((previous) =>
            previous.includes(id)
                ? previous.filter((value) => value !== id)
                : [...previous, id],
        );
    };

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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('activityLog.title')} />

            <PageLayout
                description={t('activityLog.description')}
                filters={
                    <>
                        <FilterSearch
                            value={search}
                            onChange={setSearch}
                            placeholder={t('activityLog.searchPlaceholder')}
                            className="max-w-[12rem] min-w-[8rem] flex-none"
                        />
                        <UserMultiSelect
                            value={userIds}
                            onChange={(next) => {
                                setUserIds(next);
                                visit({ user_ids: next });
                            }}
                            placeholder={t('activityLog.allUsers')}
                            initialUsers={initialSelectedUsers}
                            className={cn(
                                filterSelectClassName,
                                'h-auto min-h-9 max-w-[12rem] min-w-[8rem] shrink-0',
                            )}
                        />
                        <select
                            value={event}
                            onChange={(changeEvent) => {
                                setEvent(changeEvent.target.value);
                                visit({
                                    event:
                                        changeEvent.target.value || undefined,
                                });
                            }}
                            className={cn(
                                filterSelectClassName,
                                'max-w-[10rem] min-w-[7rem] shrink-0',
                            )}
                            aria-label={t('activityLog.filterByAction')}
                            title={
                                event
                                    ? eventLabel(event)
                                    : t('activityLog.allActions')
                            }
                        >
                            <option value="">
                                {t('activityLog.allActions')}
                            </option>
                            {events.map((eventName) => (
                                <option key={eventName} value={eventName}>
                                    {eventLabel(eventName)}
                                </option>
                            ))}
                        </select>
                        <select
                            value={logName}
                            onChange={(changeEvent) => {
                                setLogName(changeEvent.target.value);
                                visit({
                                    log_name:
                                        changeEvent.target.value || undefined,
                                });
                            }}
                            className={cn(
                                filterSelectClassName,
                                'max-w-[10rem] min-w-[7rem] shrink-0',
                            )}
                            aria-label={t('activityLog.filterByLog')}
                            title={
                                logName
                                    ? logNameLabel(logName)
                                    : t('activityLog.allLogs')
                            }
                        >
                            <option value="">{t('activityLog.allLogs')}</option>
                            {logNames.map((name) => (
                                <option key={name} value={name}>
                                    {logNameLabel(name)}
                                </option>
                            ))}
                        </select>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(changeEvent) => {
                                setDateFrom(changeEvent.target.value);
                                visit({
                                    date_from:
                                        changeEvent.target.value || undefined,
                                });
                            }}
                            className="h-9 w-auto shrink-0"
                            title={dateFrom || undefined}
                            aria-label={t('activityLog.dateFrom')}
                        />
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(changeEvent) => {
                                setDateTo(changeEvent.target.value);
                                visit({
                                    date_to:
                                        changeEvent.target.value || undefined,
                                });
                            }}
                            className="h-9 w-auto shrink-0"
                            aria-label={t('activityLog.dateTo')}
                        />
                    </>
                }
            >
                <TablePanel
                    footer={
                        activityLogs.last_page > 1 ? (
                            <TablePagination links={activityLogs.links ?? []} />
                        ) : undefined
                    }
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8" />
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
                                <TableHead>
                                    {t('activityLog.columns.subject')}
                                </TableHead>
                                <TableHead className="w-[1%] text-right">
                                    {t('activityLog.columns.actions')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(activityLogs.data ?? []).length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        {t('activityLog.empty')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                (activityLogs.data ?? []).map((row) => {
                                    const isExpanded = expandedIds.includes(
                                        row.id,
                                    );

                                    return (
                                        <Fragment key={row.id}>
                                            <TableRow>
                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleExpanded(
                                                                row.id,
                                                            )
                                                        }
                                                        className="text-muted-foreground hover:text-foreground"
                                                        aria-label={
                                                            isExpanded
                                                                ? t(
                                                                      'activityLog.collapse',
                                                                  )
                                                                : t(
                                                                      'activityLog.expand',
                                                                  )
                                                        }
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="size-4" />
                                                        ) : (
                                                            <ChevronRight className="size-4" />
                                                        )}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="text-sm whitespace-nowrap">
                                                    {formatDate(row.created_at)}
                                                </TableCell>
                                                <TableCell>
                                                    {row.causer ? (
                                                        <div className="text-sm">
                                                            <div>
                                                                {
                                                                    row.causer
                                                                        .name
                                                                }
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {
                                                                    row.causer
                                                                        .email
                                                                }
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground">
                                                            {t(
                                                                'activityLog.system',
                                                            )}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary">
                                                        {eventLabel(row.event)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-xs text-sm">
                                                    <TruncatedText
                                                        text={
                                                            row.description ||
                                                            '—'
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {row.subject ? (
                                                        <>
                                                            {row.subject.type}{' '}
                                                            {row.subject.label}
                                                        </>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <AskAiButton
                                                        prompt={seedActivityLogPrompt(
                                                            {
                                                                id: row.id,
                                                                description:
                                                                    row.description,
                                                                event: row.event,
                                                            },
                                                        )}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                            {isExpanded ? (
                                                <TableRow
                                                    key={`${row.id}-details`}
                                                >
                                                    <TableCell colSpan={7}>
                                                        <div className="space-y-3 py-2">
                                                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                                                                <div>
                                                                    <span className="text-muted-foreground">
                                                                        {t(
                                                                            'activityLog.logName',
                                                                        )}
                                                                        :
                                                                    </span>{' '}
                                                                    {logNameLabel(
                                                                        row.log_name ??
                                                                            'default',
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <span className="text-muted-foreground">
                                                                        IP:
                                                                    </span>{' '}
                                                                    {row
                                                                        .properties
                                                                        .ip ??
                                                                        '—'}
                                                                </div>
                                                            </div>
                                                            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                                                                {renderChanges(
                                                                    row,
                                                                )}
                                                            </pre>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TablePanel>
            </PageLayout>
        </AppLayout>
    );
}
