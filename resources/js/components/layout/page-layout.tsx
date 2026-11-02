import { router } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
} from '@/components/ui/pagination';
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
            className={cn('flex min-h-0 flex-1 flex-col gap-4 p-4', className)}
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
 * Surface wrapper for data tables with optional sticky footer.
 * Spacing and row separators come from Table*; no extra outer border.
 *
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
                'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card',
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
 * Strip Laravel pagination HTML labels to plain text for aria / layout checks.
 */
function paginationPlainLabel(label: string): string {
    // Parse as HTML so tags/entities resolve safely — regex tag-stripping
    // reintroduces nested sequences (CodeQL js/incomplete-multi-character-sanitization).
    return (
        new DOMParser()
            .parseFromString(label, 'text/html')
            .body.textContent?.replace(/\s+/g, ' ')
            .trim() ?? ''
    );
}

/**
 * @param {string} label - Raw Laravel pagination link label (may include HTML entities).
 * @returns {string | undefined} Accessible name for the control.
 */
function paginationAriaLabel(label: string): string | undefined {
    const plain = paginationPlainLabel(label);

    if (/^\d+$/.test(plain)) {
        return `Go to page ${plain}`;
    }

    if (/previous/i.test(plain)) {
        return 'Go to previous page';
    }

    if (/next/i.test(plain)) {
        return 'Go to next page';
    }

    return plain.length > 0 ? plain : undefined;
}

/**
 * Laravel-style pagination link row via shadcn Pagination + Inertia visits.
 * Query params are unchanged; controls remain `<button>` for browser tests.
 *
 * @param {{ links: TablePaginationLink[] }} props - Component props.
 * @param {TablePaginationLink[]} props.links - Pagination links from the server.
 * @returns {JSX.Element | null}
 */
export function TablePagination({ links }: { links: TablePaginationLink[] }) {
    if (links.length === 0) {
        return null;
    }

    return (
        <Pagination>
            <PaginationContent>
                {links.map((link, index) => {
                    const plain = paginationPlainLabel(link.label);
                    const isPageNumber = /^\d+$/.test(plain);

                    return (
                        <PaginationItem key={index}>
                            <button
                                type="button"
                                className={cn(
                                    buttonVariants({
                                        variant: link.active
                                            ? 'outline'
                                            : 'ghost',
                                        size: isPageNumber ? 'icon' : 'sm',
                                    }),
                                    !isPageNumber && 'min-w-0 px-2.5',
                                    !link.url &&
                                        'pointer-events-none opacity-50',
                                )}
                                disabled={!link.url}
                                aria-label={paginationAriaLabel(link.label)}
                                aria-current={link.active ? 'page' : undefined}
                                onClick={() =>
                                    link.url && router.visit(link.url)
                                }
                                dangerouslySetInnerHTML={{
                                    __html: link.label,
                                }}
                            />
                        </PaginationItem>
                    );
                })}
            </PaginationContent>
        </Pagination>
    );
}
