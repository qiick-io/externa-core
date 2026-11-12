import { router } from '@inertiajs/react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import type { RefObject } from 'react';
import ItemListController from '@/actions/App/Http/Controllers/Collections/ItemListController';
import { createSortableList } from '@/lib/create-sortable-list';
import type { ColumnAlign } from './column-header-menu';
import type { ListLayout } from './items-index-helpers';

type UseItemsListPrefsOptions = {
    collectionId: number;
    listColumnsProp: string[];
    columnAlignsProp: Record<string, ColumnAlign>;
    listLayoutProp: ListLayout;
    kanbanFieldProp: string | null;
    calendarFieldProp: string | null;
    /** Table header row whose `[data-sortable-column]` cells reorder the columns. */
    headerRowRef: RefObject<HTMLTableRowElement | null>;
};

/**
 * Per-user list preferences of a collection's items page: visible columns,
 * column alignment, layout (table / kanban / calendar) and the kanban and
 * calendar fields.
 *
 * Local edits apply at once and are saved with ItemListController.updateListColumns;
 * a new server value replaces the local one during render. Also mounts the
 * drag-to-reorder Sortable on the table header row.
 */
export function useItemsListPrefs({
    collectionId,
    listColumnsProp,
    columnAlignsProp,
    listLayoutProp,
    kanbanFieldProp,
    calendarFieldProp,
    headerRowRef,
}: UseItemsListPrefsOptions) {
    const [listColumns, setListColumns] = useState(listColumnsProp);
    const [columnAligns, setColumnAligns] = useState(columnAlignsProp);
    const [listLayout, setListLayout] = useState<ListLayout>(
        listLayoutProp === 'kanban' || listLayoutProp === 'calendar'
            ? listLayoutProp
            : 'table',
    );
    const [kanbanField, setKanbanField] = useState<string | null>(
        kanbanFieldProp,
    );
    const [calendarField, setCalendarField] = useState<string | null>(
        calendarFieldProp,
    );

    const [previousServerProps, setPreviousServerProps] = useState({
        listColumnsProp,
        columnAlignsProp,
        listLayoutProp,
        kanbanFieldProp,
        calendarFieldProp,
    });

    // Adopt each server prop during render when Inertia sends a new value
    // (React's "adjust state on prop change" pattern); local edits survive
    // until then.
    if (
        previousServerProps.listColumnsProp !== listColumnsProp ||
        previousServerProps.columnAlignsProp !== columnAlignsProp ||
        previousServerProps.listLayoutProp !== listLayoutProp ||
        previousServerProps.kanbanFieldProp !== kanbanFieldProp ||
        previousServerProps.calendarFieldProp !== calendarFieldProp
    ) {
        setPreviousServerProps({
            listColumnsProp,
            columnAlignsProp,
            listLayoutProp,
            kanbanFieldProp,
            calendarFieldProp,
        });

        if (previousServerProps.listColumnsProp !== listColumnsProp) {
            setListColumns(listColumnsProp);
        }

        if (previousServerProps.columnAlignsProp !== columnAlignsProp) {
            setColumnAligns(columnAlignsProp);
        }

        if (previousServerProps.listLayoutProp !== listLayoutProp) {
            setListLayout(
                listLayoutProp === 'kanban' || listLayoutProp === 'calendar'
                    ? listLayoutProp
                    : 'table',
            );
        }

        if (previousServerProps.kanbanFieldProp !== kanbanFieldProp) {
            setKanbanField(kanbanFieldProp);
        }

        if (previousServerProps.calendarFieldProp !== calendarFieldProp) {
            setCalendarField(calendarFieldProp);
        }
    }

    const persistPrefs = useCallback(
        (
            columns: string[],
            aligns: Record<string, ColumnAlign>,
            extras?: {
                layout?: ListLayout;
                kanban_field?: string | null;
                calendar_field?: string | null;
            },
        ) => {
            setListColumns(columns);
            setColumnAligns(aligns);
            router.put(
                ItemListController.updateListColumns.url(collectionId),
                {
                    columns,
                    aligns,
                    layout: extras?.layout ?? listLayout,
                    kanban_field:
                        extras && 'kanban_field' in extras
                            ? extras.kanban_field
                            : kanbanField,
                    calendar_field:
                        extras && 'calendar_field' in extras
                            ? extras.calendar_field
                            : calendarField,
                },
                { preserveScroll: true, preserveState: true },
            );
        },
        [calendarField, collectionId, kanbanField, listLayout],
    );

    const setLayout = useCallback(
        (layout: ListLayout) => {
            setListLayout(layout);
            persistPrefs(listColumns, columnAligns, { layout });
        },
        [columnAligns, listColumns, persistPrefs],
    );

    const persistColumns = useCallback(
        (columns: string[]) => {
            const nextAligns = Object.fromEntries(
                Object.entries(columnAligns).filter(([path]) =>
                    columns.includes(path),
                ),
            ) as Record<string, ColumnAlign>;
            persistPrefs(columns, nextAligns);
        },
        [columnAligns, persistPrefs],
    );

    const listColumnsRef = useRef(listColumns);
    const persistColumnsRef = useRef(persistColumns);
    const listColumnsKey = listColumns.join('\0');

    useLayoutEffect(() => {
        listColumnsRef.current = listColumns;
        persistColumnsRef.current = persistColumns;
    });

    useEffect(() => {
        const el = headerRowRef.current;

        if (!el || listColumnsKey === '') {
            return;
        }

        // ponytail: Sortable on <tr>; only [data-sortable-column] th move (checkbox/actions stay put)
        const sortable = createSortableList(el, {
            handle: '.drag-handle',
            draggable: '[data-sortable-column]',
            direction: 'horizontal',
            onEnd: () => {
                const next = sortable.toArray();
                const prev = listColumnsRef.current;

                if (next.length === 0 || next.join('\0') === prev.join('\0')) {
                    return;
                }

                persistColumnsRef.current(next);
            },
        });

        return () => sortable.destroy();
        // headerRowRef is the page's stable ref object; listing it never re-runs the effect.
    }, [headerRowRef, listColumnsKey]);

    return {
        listColumns,
        columnAligns,
        listLayout,
        kanbanField,
        setKanbanField,
        calendarField,
        setCalendarField,
        persistPrefs,
        setLayout,
        persistColumns,
    };
}
