import { Link, router } from '@inertiajs/react';
import { useEffect, useMemo, useRef } from 'react';
import ItemController from '@/actions/App/Http/Controllers/Collections/ItemController';
import { parseFieldOptions } from '@/lib/collection-field-types';
import { createSortableList } from '@/lib/create-sortable-list';
import { currentPathWithQuery, withReturnParam } from '@/lib/safe-return-url';
import collections from '@/routes/collections';
import type { CollectionFieldRow, CollectionView } from '@/types';

type ItemRow = {
    id: number;
    data: Record<string, unknown>;
    displays?: Record<string, string | null>;
    has_draft?: boolean;
    approval_status?: string | null;
};

function scalarFieldValue(row: ItemRow, fieldName: string): string {
    const display = row.displays?.[fieldName];

    if (typeof display === 'string') {
        return display;
    }

    const raw = row.data?.[fieldName];

    if (typeof raw === 'string' || typeof raw === 'number') {
        return String(raw);
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const first = Object.values(raw as Record<string, unknown>).find(
            (value) => typeof value === 'string' || typeof value === 'number',
        );

        if (first !== undefined) {
            return String(first);
        }
    }

    return '';
}

function itemTitle(row: ItemRow): string {
    const title = scalarFieldValue(row, 'title');

    return title.trim() !== '' ? title : `#${row.id}`;
}

/**
 * Kanban board for select/radio status field. Drag updates via item PUT.
 */
export function ItemsKanban({
    collection,
    items,
    fieldName,
    canEdit,
    isTrashed,
}: {
    collection: CollectionView;
    items: ItemRow[];
    fieldName: string | null;
    canEdit: boolean;
    isTrashed: boolean;
}) {
    const boardRef = useRef<HTMLDivElement | null>(null);
    const field = useMemo(
        () =>
            (collection.fields ?? []).find(
                (entry: CollectionFieldRow) => entry.name === fieldName,
            ) ?? null,
        [collection.fields, fieldName],
    );

    const columns = useMemo(() => {
        if (!field) {
            return [{ value: '', label: 'No value' }];
        }

        const options = parseFieldOptions(field.settings).filter(
            (option) => option.value.trim() !== '',
        );
        const allowNone =
            field.settings?.allow_none === true ||
            field.settings?.allow_none === 1 ||
            field.settings?.allow_none === '1';

        return [
            ...(allowNone || options.length === 0
                ? [{ value: '', label: 'No value' }]
                : []),
            ...options.map((option) => ({
                value: option.value,
                label: option.label.trim() !== '' ? option.label : option.value,
            })),
        ];
    }, [field]);

    const grouped = useMemo(() => {
        const map = new Map<string, ItemRow[]>();

        for (const column of columns) {
            map.set(column.value, []);
        }

        for (const item of items) {
            const value = fieldName ? scalarFieldValue(item, fieldName) : '';
            const key = map.has(value) ? value : '';
            const bucket = map.get(key) ?? map.get('') ?? [];
            bucket.push(item);
            map.set(key, bucket);
        }

        return map;
    }, [columns, fieldName, items]);

    useEffect(() => {
        if (!boardRef.current || !canEdit || isTrashed || !fieldName) {
            return;
        }

        const lists = Array.from(
            boardRef.current.querySelectorAll<HTMLElement>(
                '[data-kanban-column]',
            ),
        );
        const sortables = lists.map((list) =>
            createSortableList(list, {
                group: 'collection-kanban',
                draggable: '[data-kanban-card]',
                handle: '[data-kanban-handle]',
                onAdd: (event) => {
                    const itemId = Number(
                        (event.item as HTMLElement).dataset.itemId,
                    );
                    const nextValue =
                        (event.to as HTMLElement).dataset.columnValue ?? '';

                    if (!Number.isFinite(itemId)) {
                        return;
                    }

                    router.put(
                        ItemController.update.url({
                            collection: collection.id,
                            item: itemId,
                        }),
                        {
                            data: {
                                [fieldName]:
                                    nextValue === '' ? null : nextValue,
                            },
                            save_action: 'stay',
                            return: currentPathWithQuery(),
                            ...(collection.versioning
                                ? { version: 'draft' }
                                : {}),
                        },
                        { preserveScroll: true },
                    );
                },
            }),
        );

        return () => {
            for (const sortable of sortables) {
                sortable.destroy();
            }
        };
    }, [
        canEdit,
        collection.id,
        collection.versioning,
        fieldName,
        isTrashed,
        items,
    ]);

    if (!fieldName || !field) {
        return (
            <p
                className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
                data-test="kanban-missing-field"
            >
                Pick a select or radio field for kanban columns.
            </p>
        );
    }

    return (
        <div
            ref={boardRef}
            className="flex gap-3 overflow-x-auto pb-2"
            data-test="items-kanban"
        >
            {columns.map((column) => (
                <section
                    key={column.value || '__empty'}
                    className="flex w-64 shrink-0 flex-col rounded-lg border bg-muted/20"
                >
                    <header className="border-b px-3 py-2 text-sm font-medium">
                        {column.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                            {grouped.get(column.value)?.length ?? 0}
                        </span>
                    </header>
                    <ul
                        className="flex min-h-24 flex-1 flex-col gap-2 p-2"
                        data-kanban-column
                        data-column-value={column.value}
                    >
                        {(grouped.get(column.value) ?? []).map((item) => (
                            <li
                                key={item.id}
                                data-kanban-card
                                data-item-id={item.id}
                                className="rounded-md border bg-background p-2 shadow-xs"
                            >
                                <div className="flex items-start gap-2">
                                    {canEdit && !isTrashed ? (
                                        <button
                                            type="button"
                                            data-kanban-handle
                                            className="mt-0.5 cursor-grab text-muted-foreground"
                                            aria-label="Drag"
                                        >
                                            ⋮⋮
                                        </button>
                                    ) : null}
                                    <Link
                                        href={withReturnParam(
                                            collections.items.show.url({
                                                collection: collection.id,
                                                item: item.id,
                                            }),
                                            currentPathWithQuery(),
                                        )}
                                        className="min-w-0 flex-1 text-sm font-medium hover:underline"
                                    >
                                        {itemTitle(item)}
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
