import { router } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

export type PageLayoutProps = {
    description?: ReactNode;
    subheader?: ReactNode;
    filters?: ReactNode;
    filtersRight?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
    scrollContent?: boolean;
};

/**
 * Standard admin page scaffold with optional header, scrollable body, and footer.
 *
 * When a page enters multi-select mode, callers should pass `filtersRight={null}`
 * (or omit it) so only bulk actions remain visible in the toolbar row.
 *
 * @param {PageLayoutProps} props - Layout section props.
 * @returns {JSX.Element}
 */
export function PageLayout({
    description,
    subheader,
    filters,
    filtersRight,
    children,
    footer,
    className,
    scrollContent = false,
}: PageLayoutProps) {
    const showHeader = Boolean(
        description || subheader || filters || filtersRight,
    );

    return (
        <div
            className={cn(
                'flex min-h-0 flex-1 flex-col gap-4 p-4',
                className,
            )}
        >
            {showHeader ? (
                <PageHeader
                    description={description}
                    subheader={subheader}
                    filters={filters}
                    filtersRight={filtersRight}
                />
            ) : null}

            <div
                className={cn(
                    'flex min-h-0 flex-1 flex-col',
                    scrollContent ? 'overflow-y-auto' : null,
                )}
            >
                {children}
            </div>

            {footer ? (
                <div className="flex shrink-0 justify-center">{footer}</div>
            ) : null}
        </div>
    );
}

/**
 * Bordered card wrapper for data tables with optional sticky footer.
 * @param {{ children: ReactNode, className?: string, footer?: ReactNode }} props - Panel props.
 * @param {ReactNode} props.children - Table or list content.
 * @param {string} [props.className] - Additional panel classes.
 * @param {ReactNode} [props.footer] - Optional footer (e.g. pagination).
 * @returns {JSX.Element}
 */
export function TablePanel({
    children,
    className,
    footer,
}: {
    children: ReactNode;
    className?: string;
    footer?: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-sidebar-border/70 bg-card dark:border-sidebar-border',
                className,
            )}
        >
            <div className="min-h-0 flex-1 overflow-auto p-1">{children}</div>
            {footer ? (
                <div className="flex shrink-0 justify-center border-t border-sidebar-border/70 px-4 py-3 dark:border-sidebar-border">
                    {footer}
                </div>
            ) : null}
        </div>
    );
}

export type TablePaginationLink = {
    url: string | null;
    label: string;
    active: boolean;
};

/**
 * Laravel-style pagination link row that visits URLs via Inertia.
 * @param {{ links: TablePaginationLink[] }} props - Component props.
 * @param {TablePaginationLink[]} props.links - Pagination links from the server.
 * @returns {JSX.Element | null}
 */
export function TablePagination({
    links,
}: {
    links: TablePaginationLink[];
}) {
    if (links.length === 0) {
        return null;
    }

    return (
        <div className="text-muted-foreground flex flex-wrap justify-center gap-2 text-sm">
            {links.map((link, index) => (
                <button
                    key={index}
                    type="button"
                    className={link.active ? 'font-semibold underline' : ''}
                    disabled={!link.url}
                    onClick={() => link.url && router.visit(link.url)}
                    dangerouslySetInnerHTML={{ __html: link.label }}
                />
            ))}
        </div>
    );
}
