import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { visit } = vi.hoisted(() => ({
    visit: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: { visit },
}));

import { TablePagination } from '@/components/layout/page-layout';

describe('TablePagination', () => {
    beforeEach(() => {
        visit.mockReset();
    });

    it('renders shadcn pagination nav with accessible page buttons', () => {
        render(
            <TablePagination
                links={[
                    {
                        url: null,
                        label: '&laquo; Previous',
                        active: false,
                    },
                    { url: '/items?page=1', label: '1', active: true },
                    { url: '/items?page=2', label: '2', active: false },
                    {
                        url: '/items?page=2',
                        label: 'Next &raquo;',
                        active: false,
                    },
                ]}
            />,
        );

        expect(
            screen.getByRole('navigation', { name: 'pagination' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Go to page 2' }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Go to previous page' }),
        ).toBeDisabled();

        screen.getByRole('button', { name: 'Go to page 2' }).click();
        expect(visit).toHaveBeenCalledWith('/items?page=2');
    });

    it('returns null when there are no links', () => {
        const { container } = render(<TablePagination links={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
