import { Link } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type { CollectionFieldRow, CollectionView } from '@/types';

type ItemRow = {
    id: number;
    data: Record<string, unknown>;
    displays?: Record<string, string | null>;
};

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

function itemTitle(row: ItemRow): string {
    const display = row.displays?.title;

    if (typeof display === 'string' && display.trim() !== '') {
        return display;
    }

    const title = row.data?.title;

    if (typeof title === 'string' && title.trim() !== '') {
        return title;
    }

    return `#${row.id}`;
}

/**
 * Month calendar for a date/datetime field. Click a day to list items.
 */
export function ItemsCalendar({
    collection,
    items,
    fieldName,
}: {
    collection: CollectionView;
    items: ItemRow[];
    fieldName: string | null;
}) {
    const field = useMemo(
        () =>
            (collection.fields ?? []).find(
                (entry: CollectionFieldRow) => entry.name === fieldName,
            ) ?? null,
        [collection.fields, fieldName],
    );

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

    const daysWithItems = useMemo(
        () =>
            Array.from(byDay.keys()).map((key) => {
                const [year, month, day] = key.split('-').map(Number);

                return new Date(year, month - 1, day);
            }),
        [byDay],
    );

    const [selected, setSelected] = useState<Date | undefined>(() => {
        const first = daysWithItems[0];

        return first ?? new Date();
    });

    const selectedKey = selected
        ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`
        : null;
    const selectedItems = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

    if (!fieldName || !field) {
        return (
            <p
                className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
                data-test="calendar-missing-field"
            >
                Pick a date field for the calendar layout.
            </p>
        );
    }

    return (
        <div
            className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]"
            data-test="items-calendar"
        >
            <Calendar
                mode="single"
                selected={selected}
                onSelect={setSelected}
                modifiers={{ hasItems: daysWithItems }}
                modifiersClassNames={{
                    hasItems: 'bg-primary/15 font-semibold',
                }}
                className="rounded-lg border"
            />
            <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-medium">
                    {selectedKey ?? 'Select a day'}
                    <span className="ml-2 text-xs text-muted-foreground">
                        {selectedItems.length}
                    </span>
                </h3>
                {selectedItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items.</p>
                ) : (
                    <ul className="space-y-2">
                        {selectedItems.map((item) => (
                            <li key={item.id}>
                                <Link
                                    href={withReturnParam(
                                        collections.items.show.url({
                                            collection: collection.id,
                                            item: item.id,
                                        }),
                                        currentPathWithQuery(),
                                    )}
                                    className="text-sm font-medium hover:underline"
                                >
                                    {itemTitle(item)}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
