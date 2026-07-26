import { Head, router } from '@inertiajs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
import type {
    AdminActivityLogRow,
    AdminUserRow,
    BreadcrumbItem,
    Paginated,
} from '@/types';

type Filters = {
    search?: string;
    user_id?: number | null;
    event?: string;
    log_name?: string;
    date_from?: string;
    date_to?: string;
};

/**
 * Searchable activity log for administrators.
 * @param {*} props.activityLogs - activityLogs.
 * @param {*} props.users - users.
 * @returns {JSX.Element}
 */
export default function AdminActivityLogsIndex({
    activityLogs: activityLogsProp,
    users: usersProp,
    events = [],
    filters = {},
}: {
    activityLogs:
        LaravelPaginated<AdminActivityLogRow> | Paginated<AdminActivityLogRow>;
    users: Array<
        Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>
    >;
    events?: string[];
    filters?: Filters;
}) {
    const activityLogs = normalizePaginated(activityLogsProp);
    const users = usersProp ?? [];
    const [search, setSearch] = useState(filters.search ?? '');
    const [userId, setUserId] = useState(
        filters.user_id ? String(filters.user_id) : '',
    );
    const [event, setEvent] = useState(filters.event ?? '');
    const [logName, setLogName] = useState(filters.log_name ?? '');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo] = useState(filters.date_to ?? '');
    const [expandedIds, setExpandedIds] = useState<number[]>([]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: 'Activity Log',
                href: adminRoutes.activityLogs.index(),
            },
        ],
        [],
    );

    const visit = useCallback(
        (overrides: Partial<Filters> = {}) => {
            router.get(
                adminRoutes.activityLogs.index({
                    query: {
                        search: search || undefined,
                        user_id: userId ? Number(userId) : undefined,
                        event: event || undefined,
                        log_name: logName || undefined,
                        date_from: dateFrom || undefined,
                        date_to: dateTo || undefined,
                        ...overrides,
                    },
                }),
                {},
                { preserveState: true, preserveScroll: true },
            );
        },
        [search, userId, event, logName, dateFrom, dateTo],
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

    const renderChanges = (row: AdminActivityLogRow): string => {
        if (!row.changes || Object.keys(row.changes).length === 0) {
            return 'No field changes recorded.';
        }

        return JSON.stringify(row.changes, null, 2);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Activity Log" />

            <PageLayout
                description="Read-only audit trail of model changes and authentication events."
                filters={
                    <>
                        <FilterSearch
                            value={search}
                            onChange={setSearch}
                            placeholder="Search description or subject…"
                        />
                        <select
                            value={userId}
                            onChange={(changeEvent) => {
                                setUserId(changeEvent.target.value);
                                visit({
                                    user_id: changeEvent.target.value
                                        ? Number(changeEvent.target.value)
                                        : undefined,
                                });
                            }}
                            className={filterSelectClassName}
                            aria-label="Filter by user"
                        >
                            <option value="">All users</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.first_name} {user.last_name ?? ''} (
                                    {user.email})
                                </option>
                            ))}
                        </select>
                        <select
                            value={event}
                            onChange={(changeEvent) => {
                                setEvent(changeEvent.target.value);
                                visit({
                                    event:
                                        changeEvent.target.value || undefined,
                                });
                            }}
                            className={filterSelectClassName}
                            aria-label="Filter by action"
                        >
                            <option value="">All actions</option>
                            {events.map((eventName) => (
                                <option key={eventName} value={eventName}>
                                    {eventName}
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
                            className={filterSelectClassName}
                            aria-label="Filter by log name"
                        >
                            <option value="">All logs</option>
                            <option value="default">default</option>
                            <option value="auth">auth</option>
                            <option value="ai">ai</option>
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
                            className="h-9 w-auto"
                            aria-label="From date"
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
                            className="h-9 w-auto"
                            aria-label="To date"
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
                                <TableHead>Date</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead className="w-[1%] text-right">
                                    Actions
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
                                        No activity found for the selected
                                        filters.
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
                                                                ? 'Collapse changes'
                                                                : 'Expand changes'
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
                                                            System
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
                                                                        Log
                                                                        name:
                                                                    </span>{' '}
                                                                    {row.log_name ??
                                                                        'default'}
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
