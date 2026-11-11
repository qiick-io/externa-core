import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const { visit } = vi.hoisted(() => ({
    visit: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: { visit },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { page?: string }) =>
            options?.page ? `${key}:${options.page}` : key,
    }),
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
            screen.getByRole('button', { name: 'pagination.goToPage:2' }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'pagination.goToPreviousPage' }),
        ).toBeDisabled();

        expect(
            screen.getByRole('button', { name: 'pagination.goToPage:1' }),
        ).toHaveAttribute('aria-current', 'page');
        expect(
            screen.getByRole('button', { name: 'pagination.goToNextPage' }),
        ).toHaveTextContent('pagination.next');

        screen.getByRole('button', { name: 'pagination.goToPage:2' }).click();
        expect(visit).toHaveBeenCalledWith('/items?page=2');
    });

    it('renders the paginator gap as an ellipsis, not a button', () => {
        const { container } = render(
            <TablePagination
                links={[
                    { url: '/items?page=1', label: '1', active: true },
                    { url: null, label: '...', active: false },
                    { url: '/items?page=9', label: '9', active: false },
                ]}
            />,
        );

        expect(within(container).getAllByRole('button')).toHaveLength(2);
        expect(
            container.querySelector('[data-slot="pagination-ellipsis"]'),
        ).not.toBeNull();
    });

    it('returns null when there are no links', () => {
        const { container } = render(<TablePagination links={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
