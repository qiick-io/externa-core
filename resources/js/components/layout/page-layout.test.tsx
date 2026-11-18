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
        i18n: { language: 'en' },
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

    it('shows a compact window of page numbers for long lists', () => {
        const { container } = render(
            <TablePagination
                links={[
                    {
                        url: '/items?page=59',
                        label: '&laquo; Previous',
                        active: false,
                    },
                    { url: '/items?page=1', label: '1', active: false },
                    { url: null, label: '...', active: false },
                    { url: '/items?page=60', label: '60', active: true },
                    { url: null, label: '...', active: false },
                    { url: '/items?page=120', label: '120', active: false },
                    {
                        url: '/items?page=61',
                        label: 'Next &raquo;',
                        active: false,
                    },
                ]}
                currentPage={60}
                lastPage={120}
            />,
        );

        const pageNames = within(container)
            .getAllByRole('button', { name: /goToPage:/ })
            .map((button) => button.textContent);

        expect(pageNames).toEqual(['1', '59', '60', '61', '120']);
        expect(
            container.querySelectorAll('[data-slot="pagination-ellipsis"]'),
        ).toHaveLength(2);
        expect(screen.getByText('common.pageOf:60')).toBeInTheDocument();

        screen.getByRole('button', { name: 'pagination.goToPage:61' }).click();
        expect(visit).toHaveBeenCalledWith('/items?page=61');
    });

    it('returns null when there are no links', () => {
        const { container } = render(<TablePagination links={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
