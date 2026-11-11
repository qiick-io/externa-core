import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
    DataTable,
    dataTableExpandColumn,
    dataTableSelectColumn,
} from './data-table';
import type { DataTableSort } from './data-table';
import { DataTableColumnHeader } from './data-table-column-header';

vi.mock('@inertiajs/react', () => ({
    router: { get: vi.fn(), visit: vi.fn() },
}));

type Person = { id: number; name: string };

const people: Person[] = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
];

const columns: ColumnDef<Person, unknown>[] = [
    dataTableSelectColumn<Person>({
        selectAllLabel: 'Select all',
        getRowLabel: (person) => `Select ${person.name}`,
    }),
    {
        accessorKey: 'name',
        enableSorting: true,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => row.original.name,
    },
];

/**
 * Table with controlled selection, the way pages wire it.
 */
function Harness({
    onRowClick,
    onSortChange,
    onSelection,
    data = people,
}: {
    onRowClick?: (person: Person) => void;
    onSortChange?: (sort: DataTableSort) => void;
    onSelection?: (selection: RowSelectionState) => void;
    data?: Person[];
}) {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    return (
        <DataTable
            columns={columns}
            data={data}
            getRowId={(person) => String(person.id)}
            sort={{ id: 'name', direction: 'asc' }}
            onSortChange={onSortChange}
            rowSelection={rowSelection}
            onRowSelectionChange={(updater) => {
                const next =
                    typeof updater === 'function'
                        ? updater(rowSelection)
                        : updater;
                setRowSelection(next);
                onSelection?.(next);
            }}
            onRowClick={onRowClick}
        />
    );
}

afterEach(() => {
    cleanup();
});

describe('DataTable', () => {
    it('selects every row from the header and keeps the ids as keys', () => {
        const onSelection = vi.fn();
        render(<Harness onSelection={onSelection} />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));

        expect(onSelection).toHaveBeenLastCalledWith({ 1: true, 2: true });
        expect(
            screen.getByRole('checkbox', { name: 'Select Ada' }),
        ).toBeChecked();
    });

    it('opens a row on click but not from its checkbox', () => {
        const onRowClick = vi.fn();
        render(<Harness onRowClick={onRowClick} />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ada' }));
        expect(onRowClick).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('Grace'));
        expect(onRowClick).toHaveBeenCalledWith(people[1]);
    });

    it('asks the server for a new sort from the column header menu', async () => {
        const onSortChange = vi.fn();
        const user = userEvent.setup();
        render(<Harness onSortChange={onSortChange} />);

        await user.click(screen.getByRole('button', { name: /Name/ }));
        await user.click(
            await screen.findByRole('menuitem', {
                name: 'common.sortDescending',
            }),
        );

        expect(onSortChange).toHaveBeenCalledWith({
            id: 'name',
            direction: 'desc',
        });
    });

    it('shows the empty state when there are no rows', () => {
        render(<Harness data={[]} />);

        expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });

    it('shows the details row of an expanded row', () => {
        render(
            <DataTable
                columns={[
                    dataTableExpandColumn<Person>({
                        expandLabel: 'Expand',
                        collapseLabel: 'Collapse',
                    }),
                    ...columns.slice(1),
                ]}
                data={people}
                getRowId={(person) => String(person.id)}
                renderExpandedRow={(person) => `Details of ${person.name}`}
            />,
        );

        expect(screen.queryByText('Details of Ada')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[0]);
        expect(screen.getByText('Details of Ada')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Collapse' }),
        ).toHaveAttribute('aria-expanded', 'true');
    });
});
