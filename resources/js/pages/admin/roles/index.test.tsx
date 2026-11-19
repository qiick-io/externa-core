import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import AdminRolesIndex from '@/pages/admin/roles/index';
import type { AdminRoleRow } from '@/types';

const postMock = vi.fn();
const deleteMock = vi.fn();
const pageProps = { errors: {} as Record<string, string> };

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) =>
            options?.name ? `${key}:${options.name}` : key,
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

vi.mock('@inertiajs/react', () => ({
    Head: ({ title }: { title?: string }) => <title>{title}</title>,
    Link: ({ href, children }: { href: unknown; children: ReactNode }) => (
        <a href={typeof href === 'string' ? href : '#'}>{children}</a>
    ),
    router: {
        post: (...args: unknown[]) => postMock(...args),
        delete: (...args: unknown[]) => deleteMock(...args),
    },
    usePage: () => ({ props: pageProps }),
}));

vi.mock('@/layouts/app-layout', () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/layouts/settings/layout', () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/page-layout', () => ({
    PageLayout: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
    ),
}));

vi.mock('@/hooks/use-can', () => ({
    useCan: () => ({
        can: () => true,
    }),
}));

vi.mock('@/components/confirm-destructive-dialog', () => ({
    ConfirmDestructiveDialog: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: { children: unknown }) => children,
    Tooltip: ({ children }: { children: unknown }) => children,
    TooltipTrigger: ({ children }: { children: unknown }) => children,
    TooltipContent: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/admin/data-table', () => ({
    DataTable: ({
        columns,
        data,
    }: {
        columns: ColumnDef<AdminRoleRow>[];
        data: AdminRoleRow[];
    }) => {
        const actionsColumn = columns.find((column) => column.id === 'actions');
        const actionsCell = actionsColumn?.cell as
            | ((context: { row: { original: AdminRoleRow } }) => ReactNode)
            | undefined;

        return (
            <div>
                {data.map((row) => (
                    <div key={row.id}>
                        {actionsCell
                            ? actionsCell({ row: { original: row } })
                            : null}
                    </div>
                ))}
            </div>
        );
    },
}));

afterEach(() => {
    cleanup();
    postMock.mockReset();
    deleteMock.mockReset();
});

const rolesResponse = {
    data: [
        {
            id: 7,
            name: 'editor',
            guard_name: 'web',
            is_system: false,
            permissions_count: 2,
            permissions: [],
        },
    ],
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: 1,
    from: 1,
    to: 1,
    links: [],
};

describe('AdminRolesIndex', () => {
    it('does not submit duplicate on Enter while IME composition is open', async () => {
        render(
            <AdminRolesIndex
                roles={
                    rolesResponse as Parameters<
                        typeof AdminRolesIndex
                    >[0]['roles']
                }
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'roles.actions.duplicate' }),
        );
        const input = await screen.findByLabelText('roles.duplicate.name');

        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

        expect(postMock).not.toHaveBeenCalled();
    });

    it('submits duplicate on Enter when IME composition is not open', async () => {
        render(
            <AdminRolesIndex
                roles={
                    rolesResponse as Parameters<
                        typeof AdminRolesIndex
                    >[0]['roles']
                }
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'roles.actions.duplicate' }),
        );
        const input = await screen.findByLabelText('roles.duplicate.name');

        fireEvent.keyDown(input, { key: 'Enter' });

        expect(postMock).toHaveBeenCalledTimes(1);
    });
});
