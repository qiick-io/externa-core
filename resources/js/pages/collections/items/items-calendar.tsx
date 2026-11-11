import { Link, router } from '@inertiajs/react';
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    GripVertical,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
} from '@/components/ui/empty';
import { Item, ItemGroup } from '@/components/ui/item';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { createSortableList } from '@/lib/create-sortable-list';
import { buildItemListQuery, itemRowTitle } from '@/lib/item-list-views';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import { cn } from '@/lib/utils';
import collections from '@/routes/collections';
import type { CollectionFieldRow, CollectionView, ItemRow } from '@/types';

export type CalendarMonthPayload = {
    field: string;
    month: string;
    from: string;
    to: string;
    data: ItemRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type CalendarView = 'month' | 'week' | 'day' | 'list';

const MAX_VISIBLE_PER_DAY = 3;

function dayKeyFromValue(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }

    if (typeof raw === 'string') {
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);

        return match?.[1] ?? null;
    }

    return null;
}

function fieldDayValue(row: ItemRow, fieldName: string): string | null {
    const raw = row.data?.[fieldName];

    if (typeof raw === 'string' || typeof raw === 'number') {
        return dayKeyFromValue(String(raw));
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const value of Object.values(raw as Record<string, unknown>)) {
            const key = dayKeyFromValue(value);

            if (key) {
                return key;
            }
        }
    }

    return null;
}

function fieldRawValue(row: ItemRow, fieldName: string): unknown {
    return row.data?.[fieldName];
}

/** Keep datetime clock when dropping onto a bare calendar day. */
function dateValueForDay(existing: unknown, dayKey: string): string {
    if (typeof existing === 'string') {
        const match = existing.match(/[T\s](\d{2}:\d{2})/);

        if (match) {
            return `${dayKey}T${match[1]}`;
        }
    }

    return dayKey;
}

function withUpdatedDate(
    row: ItemRow,
    fieldName: string,
    dayKey: string,
): ItemRow {
    const existing = fieldRawValue(row, fieldName);

    return {
        ...row,
        data: {
            ...row.data,
            [fieldName]: dateValueForDay(existing, dayKey),
        },
    };
}

function formatDayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseDayKey(day: string): Date {
    const [year, mon, d] = day.split('-').map(Number);

    return new Date(year, mon - 1, d);
}

function parseMonthKey(month: string): Date {
    const [year, mon] = month.split('-').map(Number);

    return new Date(year, mon - 1, 1);
}

function shiftMonth(month: string, delta: number): string {
    const date = parseMonthKey(month);
    date.setMonth(date.getMonth() + delta);

    return monthKey(date);
}

function shiftDay(day: string, delta: number): string {
    const date = parseDayKey(day);
    date.setDate(date.getDate() + delta);

    return formatDayKey(date);
}

/** Sunday-start week containing `day` (Y-m-d). */
function weekDaysFor(day: string): Date[] {
    const anchor = parseDayKey(day);
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());

    return Array.from({ length: 7 }, (_, index) => {
        const next = new Date(start);
        next.setDate(start.getDate() + index);

        return next;
    });
}

/** Sunday-start visible grid for a Y-m month (includes adjacent padding days). */
function visibleDaysForMonth(month: string): Date[] {
    const first = parseMonthKey(month);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay()); // Sun=0

    const lastOfMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const weeks = Math.ceil((first.getDay() + lastOfMonth.getDate()) / 7);
    const total = weeks * 7;

    const days: Date[] = [];

    for (let i = 0; i < total; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        days.push(day);
    }

    return days;
}

function itemHref(collectionId: number, itemId: number): string {
    return withReturnParam(
        collections.items.show.url({
            collection: collectionId,
            item: itemId,
        }),
        currentPathWithQuery(),
    );
}

function restoreCalendarDom(
    root: HTMLElement,
    byDay: Map<string, ItemRow[]>,
): void {
    const chips = new Map<number, HTMLElement>();

    for (const chip of root.querySelectorAll('[data-calendar-chip]')) {
        if (!(chip instanceof HTMLElement)) {
            continue;
        }

        const id = Number(chip.dataset.itemId);

        if (Number.isFinite(id)) {
            chips.set(id, chip);
        }
    }

    for (const [day, items] of byDay) {
        const list = root.querySelector(
            `[data-calendar-day-list][data-day="${CSS.escape(day)}"]`,
        );

        if (!(list instanceof HTMLElement)) {
            continue;
        }

        for (const child of Array.from(list.children)) {
            if (
                child instanceof HTMLElement &&
                child.hasAttribute('data-calendar-chip')
            ) {
                child.remove();
            }
        }

        for (const item of items) {
            const chip = chips.get(item.id);

            if (chip) {
                list.appendChild(chip);
            }
        }
    }
}

/**
 * Full-height collection calendar: Month / Week / Day / List views, with day-to-day drag.
 */
export function ItemsCalendar({
    collection,
    fieldName,
    filters,
    initial,
    canEdit = false,
    isTrashed = false,
}: {
    collection: CollectionView;
    fieldName: string | null;
    filters: Record<string, unknown>;
    initial: CalendarMonthPayload | null;
    canEdit?: boolean;
    isTrashed?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const field = useMemo(
        () =>
            (collection.fields ?? []).find(
                (entry: CollectionFieldRow) => entry.name === fieldName,
            ) ?? null,
        [collection.fields, fieldName],
    );

    const [view, setView] = useState<CalendarView>('month');
    const [cursor, setCursor] = useState(
        () => initial?.month ?? monthKey(new Date()),
    );
    const [focusDay, setFocusDay] = useState(() => formatDayKey(new Date()));
    const [items, setItems] = useState<ItemRow[]>(() => initial?.data ?? []);
    const [total, setTotal] = useState(() => initial?.total ?? 0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    const boardRef = useRef<HTMLDivElement | null>(null);
    const [sortableEpoch, setSortableEpoch] = useState(0);
    const itemsRef = useRef(items);
    useLayoutEffect(() => {
        itemsRef.current = items;
    });

    const listQuery = useMemo(() => buildItemListQuery(filters), [filters]);

    const range = useMemo(() => {
        if (view === 'week') {
            const days = weekDaysFor(focusDay);

            return {
                from: formatDayKey(days[0]!),
                to: formatDayKey(days[6]!),
                month: monthKey(parseDayKey(focusDay)),
            };
        }

        if (view === 'day') {
            return {
                from: focusDay,
                to: focusDay,
                month: monthKey(parseDayKey(focusDay)),
            };
        }

        // month + list: full visible month grid (list uses same fetch window)
        const days = visibleDaysForMonth(cursor);

        return {
            from: formatDayKey(days[0]!),
            to: formatDayKey(days[days.length - 1]!),
            month: cursor,
        };
    }, [view, cursor, focusDay]);

    const isServerSnapshotInRange =
        view === 'month' &&
        initial !== null &&
        initial.field === fieldName &&
        initial.month === cursor &&
        initial.from === range.from &&
        initial.to === range.to;
    const [previousSnapshotSource, setPreviousSnapshotSource] = useState({
        initial,
        fieldName,
        cursor,
        view,
        from: range.from,
        to: range.to,
    });
    // Null on mount, so the first render raises the loading flag when it must fetch.
    const [previousRangeRequest, setPreviousRangeRequest] = useState<{
        fieldName: string | null;
        from: string;
        to: string;
        month: string;
        collectionId: number;
        listQuery: typeof listQuery;
        t: typeof t;
        initial: CalendarMonthPayload | null;
        view: CalendarView;
        cursor: string;
    } | null>(null);

    // Adopt the SSR payload during render when field/filters/inertia props match
    // the month view snapshot (React's "adjust state on prop change" pattern).
    if (
        previousSnapshotSource.initial !== initial ||
        previousSnapshotSource.fieldName !== fieldName ||
        previousSnapshotSource.cursor !== cursor ||
        previousSnapshotSource.view !== view ||
        previousSnapshotSource.from !== range.from ||
        previousSnapshotSource.to !== range.to
    ) {
        setPreviousSnapshotSource({
            initial,
            fieldName,
            cursor,
            view,
            from: range.from,
            to: range.to,
        });

        if (isServerSnapshotInRange) {
            setItems(initial.data);
            setTotal(initial.total);
            setError(null);
            setLoading(false);
        }
    }

    // Raise the loading flag during render for the range the effect below fetches.
    if (
        previousRangeRequest === null ||
        previousRangeRequest.fieldName !== fieldName ||
        previousRangeRequest.from !== range.from ||
        previousRangeRequest.to !== range.to ||
        previousRangeRequest.month !== range.month ||
        previousRangeRequest.collectionId !== collection.id ||
        previousRangeRequest.listQuery !== listQuery ||
        previousRangeRequest.t !== t ||
        previousRangeRequest.initial !== initial ||
        previousRangeRequest.view !== view ||
        previousRangeRequest.cursor !== cursor
    ) {
        setPreviousRangeRequest({
            fieldName,
            from: range.from,
            to: range.to,
            month: range.month,
            collectionId: collection.id,
            listQuery,
            t,
            initial,
            view,
            cursor,
        });

        if (fieldName && !isServerSnapshotInRange) {
            setLoading(true);
            setError(null);
        }
    }

    useEffect(() => {
        if (!fieldName || isServerSnapshotInRange) {
            return;
        }

        // The loading flag is raised during render (see `previousRangeRequest` above).
        const id = ++requestIdRef.current;

        void (async () => {
            try {
                const url = ItemController.calendarMonth.url(collection.id, {
                    query: {
                        ...listQuery,
                        field: fieldName,
                        from: range.from,
                        to: range.to,
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
                    throw new Error('calendar range fetch failed');
                }

                const payload = (await response.json()) as {
                    data?: ItemRow[];
                    total?: number;
                };

                if (id !== requestIdRef.current) {
                    return;
                }

                setItems(Array.isArray(payload.data) ? payload.data : []);
                setTotal(typeof payload.total === 'number' ? payload.total : 0);
                setCursor(range.month);
            } catch {
                if (id !== requestIdRef.current) {
                    return;
                }

                setError(t('collections.itemsList.calendarLoadError'));
            } finally {
                if (id === requestIdRef.current) {
                    setLoading(false);
                }
            }
        })();
    }, [
        collection.id,
        fieldName,
        listQuery,
        t,
        range.from,
        range.to,
        range.month,
        initial,
        view,
        cursor,
        isServerSnapshotInRange,
    ]);

    const byDay = useMemo(() => {
        const map = new Map<string, ItemRow[]>();

        if (!fieldName) {
            return map;
        }

        for (const item of items) {
            const key = fieldDayValue(item, fieldName);

            if (!key) {
                continue;
            }

            const bucket = map.get(key) ?? [];
            bucket.push(item);
            map.set(key, bucket);
        }

        return map;
    }, [fieldName, items]);

    const byDayRef = useRef(byDay);
    useLayoutEffect(() => {
        byDayRef.current = byDay;
    });

    const persistMove = useCallback(
        (itemId: number, dayKey: string) => {
            if (!fieldName) {
                return;
            }

            const existing = itemsRef.current.find((row) => row.id === itemId);
            const nextValue = dateValueForDay(
                existing ? fieldRawValue(existing, fieldName) : null,
                dayKey,
            );

            setItems((current) =>
                current.map((row) =>
                    row.id === itemId
                        ? withUpdatedDate(row, fieldName, dayKey)
                        : row,
                ),
            );
            setSortableEpoch((epoch) => epoch + 1);

            router.put(
                ItemController.update.url({
                    collection: collection.id,
                    item: itemId,
                }),
                {
                    data: {
                        [fieldName]: nextValue,
                    },
                    calendar_move: true,
                    save_action: 'stay',
                    return: currentPathWithQuery(),
                },
                { preserveScroll: true },
            );
        },
        [collection.id, fieldName],
    );

    useEffect(() => {
        if (
            !boardRef.current ||
            !canEdit ||
            isTrashed ||
            !fieldName ||
            view === 'list'
        ) {
            return;
        }

        const root = boardRef.current;
        const lists = Array.from(
            root.querySelectorAll<HTMLElement>('[data-calendar-day-list]'),
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
                    group: 'collection-calendar',
                    draggable: '[data-calendar-chip]',
                    handle: '[data-calendar-handle]',
                    emptyInsertThreshold: 24,
                    onEnd: (event) => {
                        const itemId = Number(
                            (event.item as HTMLElement).dataset.itemId,
                        );
                        const fromDay =
                            (event.from as HTMLElement).dataset.day ?? '';
                        const toDay =
                            (event.to as HTMLElement).dataset.day ?? '';

                        destroyAll();
                        restoreCalendarDom(root, byDayRef.current);

                        if (
                            !Number.isFinite(itemId) ||
                            toDay === '' ||
                            toDay === fromDay
                        ) {
                            setSortableEpoch((epoch) => epoch + 1);

                            return;
                        }

                        persistMove(itemId, toDay);
                    },
                }),
            );
        }

        return destroyAll;
    }, [
        canEdit,
        isTrashed,
        fieldName,
        view,
        sortableEpoch,
        range.from,
        range.to,
        items.length,
        persistMove,
    ]);

    // Read once per mount: Date is impure, and a page left open past midnight is fine with it.
    const [todayKey] = useState(() => formatDayKey(new Date()));
    const monthDays = useMemo(() => visibleDaysForMonth(cursor), [cursor]);
    const weekDays = useMemo(() => weekDaysFor(focusDay), [focusDay]);
    const weekCount = Math.max(1, Math.ceil(monthDays.length / 7));

    const titleLabel = useMemo(() => {
        if (view === 'day') {
            return parseDayKey(focusDay).toLocaleDateString(i18n.language, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            });
        }

        if (view === 'week') {
            const days = weekDaysFor(focusDay);
            const start = days[0]!;
            const end = days[6]!;
            const sameMonth = start.getMonth() === end.getMonth();

            if (sameMonth) {
                return `${start.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`;
            }

            return `${start.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }

        return parseMonthKey(cursor).toLocaleDateString(i18n.language, {
            month: 'long',
            year: 'numeric',
        });
    }, [view, focusDay, cursor, i18n.language]);

    const weekdayLabels = useMemo(() => {
        const sunday = new Date(2024, 0, 7); // Sunday

        return Array.from({ length: 7 }, (_, index) => {
            const day = new Date(sunday);
            day.setDate(sunday.getDate() + index);

            return day.toLocaleDateString(i18n.language, { weekday: 'short' });
        });
    }, [i18n.language]);

    const listRows = useMemo(() => {
        if (!fieldName) {
            return [];
        }

        return [...items]
            .map((item) => ({
                item,
                day: fieldDayValue(item, fieldName),
            }))
            .filter(
                (entry): entry is { item: ItemRow; day: string } =>
                    entry.day !== null,
            )
            .sort(
                (a, b) => a.day.localeCompare(b.day) || a.item.id - b.item.id,
            );
    }, [items, fieldName]);

    const goToday = (): void => {
        const today = new Date();
        setFocusDay(formatDayKey(today));
        setCursor(monthKey(today));
    };

    const shiftFocusMonth = (deltaMonths: number): void => {
        setCursor((current) => {
            const next = shiftMonth(current, deltaMonths);
            const nextMonth = parseMonthKey(next);

            setFocusDay((day) =>
                formatDayKey(
                    new Date(
                        nextMonth.getFullYear(),
                        nextMonth.getMonth(),
                        Math.min(parseDayKey(day).getDate(), 28),
                    ),
                ),
            );

            return next;
        });
    };

    const goPrev = (): void => {
        if (view === 'day') {
            setFocusDay((current) => shiftDay(current, -1));

            return;
        }

        if (view === 'week') {
            setFocusDay((current) => shiftDay(current, -7));

            return;
        }

        shiftFocusMonth(-1);
    };

    const goNext = (): void => {
        if (view === 'day') {
            setFocusDay((current) => shiftDay(current, 1));

            return;
        }

        if (view === 'week') {
            setFocusDay((current) => shiftDay(current, 7));

            return;
        }

        shiftFocusMonth(1);
    };

    const goPrevYear = (): void => {
        if (view === 'day' || view === 'week') {
            setFocusDay((current) => {
                const date = parseDayKey(current);
                date.setFullYear(date.getFullYear() - 1);

                return formatDayKey(date);
            });

            return;
        }

        shiftFocusMonth(-12);
    };

    const goNextYear = (): void => {
        if (view === 'day' || view === 'week') {
            setFocusDay((current) => {
                const date = parseDayKey(current);
                date.setFullYear(date.getFullYear() + 1);

                return formatDayKey(date);
            });

            return;
        }

        shiftFocusMonth(12);
    };

    const switchView = (next: CalendarView): void => {
        setView(next);

        if (next === 'month' || next === 'list') {
            setCursor(monthKey(parseDayKey(focusDay)));
        }
    };

    if (!fieldName || !field) {
        return (
            <Empty
                className="gap-3 border border-dashed p-6 md:p-6"
                data-test="calendar-missing-field"
            >
                <EmptyHeader>
                    <EmptyMedia
                        variant="icon"
                        className="bg-primary/10 text-primary"
                    >
                        <CalendarDays />
                    </EmptyMedia>
                    <EmptyDescription>
                        {t('collections.itemsList.calendarMissingField')}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    const renderChip = (item: ItemRow, compact = true): ReactNode => (
        <div
            key={item.id}
            data-calendar-chip
            data-item-id={item.id}
            data-test="calendar-item-chip"
            className={cn(
                'group flex items-center gap-0.5 rounded border border-border bg-muted text-foreground',
                compact
                    ? 'px-0.5 py-0.5 text-xs leading-tight hover:bg-muted/80'
                    : 'px-2 py-2 text-sm hover:bg-muted/80',
            )}
        >
            {canEdit && !isTrashed ? (
                <span
                    data-calendar-handle
                    data-test="calendar-drag-handle"
                    className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                    aria-hidden
                >
                    <GripVertical className={compact ? 'size-3' : 'size-3.5'} />
                </span>
            ) : null}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Link
                        href={itemHref(collection.id, item.id)}
                        className="min-w-0 flex-1 truncate px-0.5 text-foreground"
                    >
                        {itemRowTitle(item)}
                    </Link>
                </TooltipTrigger>
                <TooltipContent>{itemRowTitle(item)}</TooltipContent>
            </Tooltip>
        </div>
    );

    const renderDayCell = (
        day: Date,
        options: { inMonth?: boolean; tall?: boolean } = {},
    ): ReactNode => {
        const key = formatDayKey(day);
        const inMonth = options.inMonth ?? true;
        const dayItems = byDay.get(key) ?? [];
        const visible = dayItems.slice(0, MAX_VISIBLE_PER_DAY);
        const overflow = dayItems.length - visible.length;
        const isToday = key === todayKey;

        return (
            <div
                key={key}
                data-test="calendar-day"
                data-day={key}
                className={cn(
                    'flex min-h-0 flex-col overflow-hidden border-r border-b p-1',
                    !inMonth && 'bg-muted/20 text-muted-foreground',
                    isToday && 'bg-primary/10',
                    options.tall && 'min-h-0',
                )}
                onDoubleClick={() => {
                    setFocusDay(key);
                    setView('day');
                }}
            >
                <div className="mb-0.5 flex shrink-0 justify-end">
                    <button
                        type="button"
                        className={cn(
                            'px-1 text-xs text-foreground tabular-nums',
                            isToday && 'font-semibold',
                            !inMonth && 'text-muted-foreground',
                        )}
                        data-test="calendar-day-number"
                        onClick={() => {
                            setFocusDay(key);
                            setView('day');
                        }}
                    >
                        {day.getDate()}
                    </button>
                </div>
                <div
                    data-calendar-day-list
                    data-day={key}
                    className="min-h-[2rem] flex-1 space-y-0.5 overflow-y-auto"
                >
                    {visible.map((item) => renderChip(item))}
                    {overflow > 0 ? (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="mt-0.5 px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                    data-test="calendar-day-more"
                                >
                                    {t('collections.itemsList.calendarMore', {
                                        count: overflow,
                                    })}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-56 p-2">
                                <ul className="max-h-64 space-y-1 overflow-y-auto">
                                    {dayItems.map((item) => (
                                        <li key={item.id}>
                                            {renderChip(item, false)}
                                        </li>
                                    ))}
                                </ul>
                            </PopoverContent>
                        </Popover>
                    ) : null}
                </div>
            </div>
        );
    };

    const viewTabs: { id: CalendarView; label: string }[] = [
        {
            id: 'month',
            label: t('collections.itemsList.calendarViewMonth'),
        },
        {
            id: 'week',
            label: t('collections.itemsList.calendarViewWeek'),
        },
        {
            id: 'day',
            label: t('collections.itemsList.calendarViewDay'),
        },
        {
            id: 'list',
            label: t('collections.itemsList.calendarViewList'),
        },
    ];

    return (
        <div
            className="flex min-h-0 flex-1 flex-col gap-3"
            data-test="items-calendar"
            data-view={view}
        >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <ButtonGroup>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t(
                                'collections.itemsList.calendarPrevYear',
                            )}
                            data-test="calendar-prev-year"
                            onClick={goPrevYear}
                        >
                            <ChevronsLeft className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t('collections.itemsList.calendarPrev')}
                            data-test="calendar-prev"
                            onClick={goPrev}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t('collections.itemsList.calendarNext')}
                            data-test="calendar-next"
                            onClick={goNext}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t(
                                'collections.itemsList.calendarNextYear',
                            )}
                            data-test="calendar-next-year"
                            onClick={goNextYear}
                        >
                            <ChevronsRight className="size-4" />
                        </Button>
                    </ButtonGroup>
                    <Button
                        type="button"
                        variant="outline"
                        data-test="calendar-today"
                        onClick={goToday}
                    >
                        {t('collections.itemsList.calendarToday')}
                    </Button>
                    {loading ? (
                        <Spinner className="ml-2 text-muted-foreground" />
                    ) : null}
                </div>

                <h2
                    className="text-base font-semibold capitalize"
                    data-test="calendar-month-label"
                >
                    {titleLabel}
                </h2>

                <ToggleGroup
                    type="single"
                    variant="outline"
                    value={view}
                    onValueChange={(next) => {
                        if (next) {
                            switchView(next as CalendarView);
                        }
                    }}
                    data-test="calendar-views"
                >
                    {viewTabs.map((tab) => (
                        <ToggleGroupItem
                            key={tab.id}
                            value={tab.id}
                            data-test={`calendar-view-${tab.id}`}
                        >
                            {tab.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>

            {total > items.length ? (
                <p className="shrink-0 text-xs text-muted-foreground">
                    {t('collections.itemsList.calendarTruncated', {
                        shown: items.length,
                        total,
                    })}
                </p>
            ) : null}

            {error ? (
                <p
                    className="shrink-0 text-sm text-destructive"
                    data-test="calendar-error"
                >
                    {error}
                </p>
            ) : null}

            <div ref={boardRef} className="flex min-h-0 flex-1 flex-col">
                {view === 'month' ? (
                    <div
                        className="grid min-h-0 flex-1 grid-cols-7 border-t border-l"
                        style={{
                            gridTemplateRows: `auto repeat(${weekCount}, minmax(0, 1fr))`,
                        }}
                        data-test="calendar-grid"
                    >
                        {weekdayLabels.map((label) => (
                            <div
                                key={label}
                                className="border-r border-b bg-muted/40 px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                            >
                                {label}
                            </div>
                        ))}
                        {monthDays.map((day) =>
                            renderDayCell(day, {
                                inMonth: monthKey(day) === cursor,
                            }),
                        )}
                    </div>
                ) : null}

                {view === 'week' ? (
                    <div
                        className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_minmax(0,1fr)] border-t border-l"
                        data-test="calendar-week"
                    >
                        {weekdayLabels.map((label) => (
                            <div
                                key={label}
                                className="border-r border-b bg-muted/40 px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                            >
                                {label}
                            </div>
                        ))}
                        {weekDays.map((day) =>
                            renderDayCell(day, { tall: true }),
                        )}
                    </div>
                ) : null}

                {view === 'day' ? (
                    <div
                        className="flex min-h-0 flex-1 flex-col border"
                        data-test="calendar-day-view"
                    >
                        <div
                            className={cn(
                                'border-b px-3 py-2 text-sm font-medium',
                                focusDay === todayKey &&
                                    'bg-muted text-foreground',
                            )}
                        >
                            {parseDayKey(focusDay).toLocaleDateString(
                                i18n.language,
                                {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                },
                            )}
                        </div>
                        <div
                            data-calendar-day-list
                            data-day={focusDay}
                            className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3"
                        >
                            {(byDay.get(focusDay) ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t(
                                        'collections.itemsList.calendarEmptyDay',
                                    )}
                                </p>
                            ) : (
                                (byDay.get(focusDay) ?? []).map((item) =>
                                    renderChip(item, false),
                                )
                            )}
                        </div>
                    </div>
                ) : null}

                {view === 'list' ? (
                    <div
                        className="min-h-0 flex-1 overflow-y-auto border"
                        data-test="calendar-list"
                    >
                        {listRows.length === 0 ? (
                            <p className="p-4 text-sm text-muted-foreground">
                                {t('collections.itemsList.calendarEmptyList')}
                            </p>
                        ) : (
                            <ItemGroup className="divide-y">
                                {listRows.map(({ item, day }) => (
                                    <Item
                                        key={item.id}
                                        role="listitem"
                                        size="sm"
                                        className="flex-nowrap rounded-none"
                                        data-test="calendar-list-row"
                                    >
                                        <time
                                            dateTime={day}
                                            className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums"
                                        >
                                            {parseDayKey(
                                                day,
                                            ).toLocaleDateString(
                                                i18n.language,
                                                {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                },
                                            )}
                                        </time>
                                        <Link
                                            href={itemHref(
                                                collection.id,
                                                item.id,
                                            )}
                                            className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
                                        >
                                            {itemRowTitle(item)}
                                        </Link>
                                    </Item>
                                ))}
                            </ItemGroup>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
