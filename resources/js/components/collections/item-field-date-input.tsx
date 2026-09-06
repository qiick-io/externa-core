import { CalendarIcon, ClockIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import {
    toDateInputValue,
    toDatetimeLocalValue,
    toTimeInputValue,
} from '@/components/collections/item-field-choice-inputs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type DateMode = 'date' | 'time' | 'datetime';

type DefaultValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;

function pad(part: number): string {
    return String(part).padStart(2, '0');
}

function initialWire(
    mode: DateMode,
    defaultValue: DefaultValue,
    includeSeconds: boolean,
): string {
    if (mode === 'date') {
        return toDateInputValue(defaultValue);
    }

    if (mode === 'time') {
        return toTimeInputValue(defaultValue, includeSeconds);
    }

    return toDatetimeLocalValue(defaultValue, includeSeconds);
}

function parseWireDate(wire: string, mode: DateMode): Date | undefined {
    if (!wire) {
        return undefined;
    }

    if (mode === 'time') {
        const [hours, minutes, seconds = '0'] = wire.split(':');
        const next = new Date();
        next.setHours(
            Number(hours) || 0,
            Number(minutes) || 0,
            Number(seconds) || 0,
            0,
        );

        return Number.isNaN(next.getTime()) ? undefined : next;
    }

    const normalized =
        mode === 'date'
            ? `${wire}T00:00:00`
            : wire.length === 16
              ? `${wire}:00`
              : wire;
    const next = new Date(normalized);

    return Number.isNaN(next.getTime()) ? undefined : next;
}

function toWire(
    date: Date,
    mode: DateMode,
    includeSeconds: boolean,
): string {
    const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const hms = includeSeconds ? `${hm}:${pad(date.getSeconds())}` : hm;

    if (mode === 'date') {
        return ymd;
    }

    if (mode === 'time') {
        return hms;
    }

    return `${ymd}T${hms}`;
}

function formatDisplay(
    date: Date,
    mode: DateMode,
    includeSeconds: boolean,
): string {
    if (mode === 'date') {
        return date.toLocaleDateString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }

    if (mode === 'time') {
        return date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: includeSeconds ? '2-digit' : undefined,
            hour12: false,
        });
    }

    return date.toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: includeSeconds ? '2-digit' : undefined,
        hour12: false,
    });
}

function timePartFromDate(date: Date, includeSeconds: boolean): string {
    const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    return includeSeconds ? `${hm}:${pad(date.getSeconds())}` : hm;
}

function applyTimeToDate(
    base: Date,
    timeValue: string,
    includeSeconds: boolean,
): Date {
    const [hours, minutes, seconds = '0'] = timeValue.split(':');
    const next = new Date(base);
    next.setHours(
        Number(hours) || 0,
        Number(minutes) || 0,
        includeSeconds ? Number(seconds) || 0 : 0,
        0,
    );

    return next;
}

const hideNativePicker =
    'appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none';

export function DateFieldInput({
    id,
    name,
    mode,
    includeSeconds,
    defaultValue,
    readonly,
    hasError,
}: {
    id: string;
    name: string;
    mode: DateMode;
    includeSeconds: boolean;
    defaultValue: DefaultValue;
    readonly: boolean;
    hasError?: boolean;
}) {
    const [wire, setWire] = useState(() =>
        initialWire(mode, defaultValue, includeSeconds),
    );
    const [open, setOpen] = useState(false);
    const hiddenRef = useRef<HTMLInputElement>(null);

    const selected = parseWireDate(wire, mode);

    const syncHidden = (next: string): void => {
        setWire(next);

        if (!hiddenRef.current) {
            return;
        }

        hiddenRef.current.value = next;
        hiddenRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const commitDate = (next: Date | undefined): void => {
        syncHidden(next ? toWire(next, mode, includeSeconds) : '');
    };

    if (mode === 'time') {
        return (
            <div className="relative">
                <Input
                    id={id}
                    type="time"
                    step={includeSeconds ? 1 : 60}
                    value={wire}
                    readOnly={readonly}
                    aria-invalid={hasError}
                    className={cn('pr-9', hideNativePicker)}
                    onChange={(event) => syncHidden(event.target.value)}
                />
                <ClockIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    ref={hiddenRef}
                    type="hidden"
                    name={name}
                    value={wire}
                />
            </div>
        );
    }

    return (
        <div>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        id={id}
                        variant="outline"
                        disabled={readonly}
                        aria-invalid={hasError}
                        className={cn(
                            'w-full justify-between font-normal',
                            !selected && 'text-muted-foreground',
                        )}
                    >
                        <span className="truncate">
                            {selected
                                ? formatDisplay(
                                      selected,
                                      mode,
                                      includeSeconds,
                                  )
                                : mode === 'date'
                                  ? 'Pick a date'
                                  : 'Pick date & time'}
                        </span>
                        <CalendarIcon className="size-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected}
                        onSelect={(next) => {
                            if (!next) {
                                commitDate(undefined);

                                return;
                            }

                            if (mode === 'datetime' && selected) {
                                next = applyTimeToDate(
                                    next,
                                    timePartFromDate(selected, includeSeconds),
                                    includeSeconds,
                                );
                            } else if (mode === 'datetime' && !selected) {
                                next.setHours(0, 0, 0, 0);
                            }

                            commitDate(next);

                            if (mode === 'date') {
                                setOpen(false);
                            }
                        }}
                    />
                    {mode === 'datetime' ? (
                        <div className="flex items-center gap-2 border-t p-3">
                            <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
                            <Input
                                type="time"
                                step={includeSeconds ? 1 : 60}
                                value={
                                    selected
                                        ? timePartFromDate(
                                              selected,
                                              includeSeconds,
                                          )
                                        : includeSeconds
                                          ? '00:00:00'
                                          : '00:00'
                                }
                                disabled={readonly || !selected}
                                className={cn('bg-background', hideNativePicker)}
                                onChange={(event) => {
                                    if (!selected) {
                                        return;
                                    }

                                    commitDate(
                                        applyTimeToDate(
                                            selected,
                                            event.target.value,
                                            includeSeconds,
                                        ),
                                    );
                                }}
                            />
                        </div>
                    ) : null}
                    {wire ? (
                        <div className="border-t p-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                disabled={readonly}
                                onClick={() => {
                                    commitDate(undefined);
                                    setOpen(false);
                                }}
                            >
                                Clear
                            </Button>
                        </div>
                    ) : null}
                </PopoverContent>
            </Popover>
            <input ref={hiddenRef} type="hidden" name={name} value={wire} />
        </div>
    );
}
