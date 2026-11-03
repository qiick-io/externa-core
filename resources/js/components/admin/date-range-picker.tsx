import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { de, enUS, it } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    fieldControlHeight,
    fieldFocusRing,
    fieldOpenBorder,
} from '@/lib/field-control-chrome';
import { appLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

/** `YYYY-MM-DD` bounds; an empty string means "no bound". */
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
};

const DAY_PICKER_LOCALES: Record<string, typeof enUS> = { de, en: enUS, it };

function parseWireDate(wire: string): Date | undefined {
    if (!wire) {
        return undefined;
    }

    const date = parseISO(wire);

    return isValid(date) ? date : undefined;
}

function toWireDate(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

/**
 * One field for a from–to date filter (antd RangePicker style) on the shadcn
 * Calendar: the first click sets the start, the second the end (either order),
 * then the range commits and the popover closes. While the end is being picked,
 * the hovered day previews the band. Values stay `YYYY-MM-DD`.
 */
export function DateRangePicker({
    value,
    onChange,
    placeholder,
    clearLabel,
    'aria-label': ariaLabel,
    className,
    dataTest,
}: DateRangePickerProps) {
    const [open, setOpen] = useState(false);
    const [pendingStart, setPendingStart] = useState<Date | undefined>();
    const [hoveredDay, setHoveredDay] = useState<Date | undefined>();

    const locale = appLocale();
    const from = parseWireDate(value.from);
    const to = parseWireDate(value.to);
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
    });
    const hasValue = from !== undefined || to !== undefined;
    const label = hasValue
        ? `${from ? dateFormatter.format(from) : '…'} – ${to ? dateFormatter.format(to) : '…'}`
        : placeholder;
    const selected: DateRange | undefined = pendingStart
        ? hoveredDay
            ? hoveredDay < pendingStart
                ? { from: hoveredDay, to: pendingStart }
                : { from: pendingStart, to: hoveredDay }
            : { from: pendingStart, to: undefined }
        : hasValue
          ? { from, to }
          : undefined;

    const selectDay = (day: Date): void => {
        if (!pendingStart) {
            setPendingStart(day);

            return;
        }

        const [start, end] =
            day < pendingStart ? [day, pendingStart] : [pendingStart, day];

        setPendingStart(undefined);
        setHoveredDay(undefined);
        setOpen(false);
        onChange({ from: toWireDate(start), to: toWireDate(end) });
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setPendingStart(undefined);
                setHoveredDay(undefined);
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    aria-label={ariaLabel}
                    data-test={dataTest}
                    className={cn(
                        fieldControlHeight,
                        'w-full min-w-0 justify-between font-normal focus-visible:ring-offset-0',
                        fieldFocusRing,
                        fieldOpenBorder,
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
                    defaultMonth={pendingStart ?? from ?? to}
                    onSelect={(_range, day) => selectDay(day)}
                    onDayMouseEnter={(day) => setHoveredDay(day)}
                    onDayMouseLeave={() => setHoveredDay(undefined)}
                />
                {hasValue ? (
                    <div className="flex justify-end border-t p-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-test={
                                dataTest ? `${dataTest}-clear` : undefined
                            }
                            onClick={() => {
                                setOpen(false);
                                setPendingStart(undefined);
                                onChange({ from: '', to: '' });
                            }}
                        >
                            {clearLabel}
                        </Button>
                    </div>
                ) : null}
            </PopoverContent>
        </Popover>
    );
}
