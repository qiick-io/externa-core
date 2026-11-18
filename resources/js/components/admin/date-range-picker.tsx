import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { de, enUS, it } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * The bounds of the range as wire strings: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` (local time)
 * with `withTime`. An empty string means "no bound".
 */
export type DateRangeValue = {
    from: string;
    to: string;
};

type DateRangePickerProps = {
    value: DateRangeValue;
    onChange: (value: DateRangeValue) => void;
    placeholder: string;
    clearLabel: string;
    'aria-label': string;
    className?: string;
    dataTest?: string;
    /** Adds a start and an end time; the range then commits with Apply. */
    withTime?: boolean;
    /** Days before `min` or after `max` cannot be picked, nor their months shown. */
    min?: Date;
    max?: Date;
};

/** Field chrome shared with the qiick inputs: 3px focus ring, primary border while open. */
const FIELD_FOCUS_RING =
    'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const FIELD_OPEN_BORDER =
    'aria-expanded:border-ring data-[state=open]:border-ring';

const DAY_PICKER_LOCALES: Record<string, typeof enUS> = { de, en: enUS, it };

const WIRE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

const DEFAULT_START_TIME = '00:00';
const DEFAULT_END_TIME = '23:59';

function twoDigits(value: number): string {
    return String(value).padStart(2, '0');
}

/** A wire date (or date and time) as a local `Date`; undefined when empty or malformed. */
function parseWireDate(wire: string): Date | undefined {
    const match = WIRE_PATTERN.exec(wire);

    if (!match) {
        return undefined;
    }

    const [, year, month, day, hours = '0', minutes = '0'] = match;
    const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
    );

    return Number.isNaN(date.getTime()) ? undefined : date;
}

function toWireDate(date: Date): string {
    return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function toWireTime(date: Date): string {
    return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function appLocale(language: string | undefined): string {
    const raw = (language || 'en').split('-')[0]?.toLowerCase() ?? 'en';

    return raw in DAY_PICKER_LOCALES ? raw : 'en';
}

/**
 * One field for a from–to date filter (antd RangePicker style) on the shadcn Calendar, from
 * externa-core: the first click sets the start, the second the end (either order); while the end
 * is being picked, the hovered day previews the band. Without `withTime` the range commits on the
 * second click and the popover closes. With `withTime` (#247 in excubia-app) the popover adds a
 * start and an end time under the calendar and the range commits with Apply, as
 * `YYYY-MM-DDTHH:mm` in local time. The calendar and the time inputs are keyboard reachable.
 */
export function DateRangePicker({
    value,
    onChange,
    placeholder,
    clearLabel,
    'aria-label': ariaLabel,
    className,
    dataTest,
    withTime = false,
    min,
    max,
}: DateRangePickerProps) {
    const { t, i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [pendingStart, setPendingStart] = useState<Date | undefined>();
    const [hoveredDay, setHoveredDay] = useState<Date | undefined>();
    // With time: the days and times being edited, committed by Apply.
    const [draft, setDraft] = useState<DateRange | undefined>();
    const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
    const [endTime, setEndTime] = useState(DEFAULT_END_TIME);

    const locale = appLocale(i18n.language);
    const from = parseWireDate(value.from);
    const to = parseWireDate(value.to);
    const formatter = new Intl.DateTimeFormat(
        locale,
        withTime
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'medium' },
    );
    const hasValue = from !== undefined || to !== undefined;
    const label = hasValue
        ? `${from ? formatter.format(from) : '…'} – ${to ? formatter.format(to) : '…'}`
        : placeholder;
    const committed = withTime ? draft : hasValue ? { from, to } : undefined;
    const selected: DateRange | undefined = pendingStart
        ? hoveredDay
            ? hoveredDay < pendingStart
                ? { from: hoveredDay, to: pendingStart }
                : { from: pendingStart, to: hoveredDay }
            : { from: pendingStart, to: undefined }
        : committed;
    const disabledDays = [
        ...(min ? [{ before: min }] : []),
        ...(max ? [{ after: max }] : []),
    ];
    const canApply = draft?.from !== undefined && draft.to !== undefined;

    const resetPending = (): void => {
        setPendingStart(undefined);
        setHoveredDay(undefined);
    };

    const openChange = (isNextOpen: boolean): void => {
        setIsOpen(isNextOpen);
        resetPending();

        if (isNextOpen && withTime) {
            setDraft(hasValue ? { from, to } : undefined);
            setStartTime(from ? toWireTime(from) : DEFAULT_START_TIME);
            setEndTime(to ? toWireTime(to) : DEFAULT_END_TIME);
        }
    };

    const selectDay = (day: Date): void => {
        if (!pendingStart) {
            setPendingStart(day);
            setDraft({ from: day, to: undefined });

            return;
        }

        const [start, end] =
            day < pendingStart ? [day, pendingStart] : [pendingStart, day];

        resetPending();

        if (withTime) {
            setDraft({ from: start, to: end });

            return;
        }

        setIsOpen(false);
        onChange({ from: toWireDate(start), to: toWireDate(end) });
    };

    const apply = (): void => {
        if (!draft?.from || !draft.to) {
            return;
        }

        setIsOpen(false);
        onChange({
            from: `${toWireDate(draft.from)}T${startTime}`,
            to: `${toWireDate(draft.to)}T${endTime}`,
        });
    };

    const clear = (): void => {
        setIsOpen(false);
        resetPending();
        setDraft(undefined);
        onChange({ from: '', to: '' });
    };

    return (
        <Popover open={isOpen} onOpenChange={openChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    // The name starts with the visible text (WCAG 2.5.3 label in name).
                    aria-label={`${label}, ${ariaLabel}`}
                    data-test={dataTest}
                    className={cn(
                        'h-control w-full min-w-0 justify-between font-normal focus-visible:ring-offset-0',
                        FIELD_FOCUS_RING,
                        FIELD_OPEN_BORDER,
                        !hasValue && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="truncate">{label}</span>
                    <CalendarIcon className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="end">
                <Calendar
                    mode="range"
                    numberOfMonths={2}
                    locale={DAY_PICKER_LOCALES[locale]}
                    selected={selected}
                    defaultMonth={pendingStart ?? from ?? to ?? max}
                    // Navigation stops at the bounds, so two months never show an empty one.
                    startMonth={min}
                    endMonth={max}
                    disabled={disabledDays}
                    onSelect={(_range, day) => selectDay(day)}
                    onDayMouseEnter={(day) => setHoveredDay(day)}
                    onDayMouseLeave={() => setHoveredDay(undefined)}
                />
                {withTime ? (
                    <div className="grid grid-cols-2 gap-3 border-t p-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="date-range-picker-start-time">
                                {t('dateRangePicker.startTime')}
                            </Label>
                            <Input
                                id="date-range-picker-start-time"
                                type="time"
                                value={startTime}
                                onChange={(event) =>
                                    setStartTime(
                                        event.target.value ||
                                            DEFAULT_START_TIME,
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="date-range-picker-end-time">
                                {t('dateRangePicker.endTime')}
                            </Label>
                            <Input
                                id="date-range-picker-end-time"
                                type="time"
                                value={endTime}
                                onChange={(event) =>
                                    setEndTime(
                                        event.target.value || DEFAULT_END_TIME,
                                    )
                                }
                            />
                        </div>
                    </div>
                ) : null}
                {hasValue || withTime ? (
                    <div className="flex justify-end gap-2 border-t p-2">
                        {hasValue ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                data-test={
                                    dataTest ? `${dataTest}-clear` : undefined
                                }
                                onClick={clear}
                            >
                                {clearLabel}
                            </Button>
                        ) : null}
                        {withTime ? (
                            <Button
                                type="button"
                                size="sm"
                                disabled={!canApply}
                                data-test={
                                    dataTest ? `${dataTest}-apply` : undefined
                                }
                                onClick={apply}
                            >
                                {t('dateRangePicker.apply')}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </PopoverContent>
        </Popover>
    );
}
