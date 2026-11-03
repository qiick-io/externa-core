import { router } from '@inertiajs/react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
} from '@/components/ui/pagination';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { LIST_PER_PAGE_OPTIONS, listUrlWithPerPage } from '@/lib/pagination';
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
export function TablePagination({
    links,
    className,
}: {
    links: TablePaginationLink[];
    className?: string;
}) {
    if (links.length === 0) {
        return null;
    }

    return (
        <Pagination className={className}>
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
                                        size: isPageNumber ? 'icon' : 'default',
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

/** Paginator slice the list footer needs (flat `Paginated` shape). */
export type TablePaginationState = {
    last_page: number;
    per_page: number;
    total: number;
    links?: TablePaginationLink[];
};

/**
 * Whether a list needs its pagination footer: more than one page, or enough
 * rows that a smaller / larger "Rows per page" choice changes what is shown.
 *
 * @param pagination - Current paginator state
 * @returns `true` when {@link TablePaginationFooter} has something to render
 */
export function hasTablePaginationFooter(
    pagination: TablePaginationState,
): boolean {
    return (
        pagination.last_page > 1 || pagination.total > LIST_PER_PAGE_OPTIONS[0]
    );
}

/**
 * Admin list footer: shared "Rows per page" select (10 / 20 / 50 / 100, URL
 * `per_page`, resets to page 1 and keeps every other query param) next to the
 * page links. Default-size (32px) shadcn Select per the control scale.
 *
 * @param props.pagination - Current paginator state
 * @returns {JSX.Element}
 */
export function TablePaginationFooter({
    pagination,
}: {
    pagination: TablePaginationState;
}) {
    const { t } = useTranslation();
    const perPageId = useId();

    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
                <span
                    id={perPageId}
                    className="text-sm whitespace-nowrap text-muted-foreground"
                >
                    {t('common.rowsPerPage')}
                </span>
                <Select
                    value={String(pagination.per_page)}
                    onValueChange={(value) =>
                        router.get(
                            listUrlWithPerPage(
                                window.location.href,
                                Number(value),
                            ),
                            {},
                            { preserveScroll: true },
                        )
                    }
                >
                    <SelectTrigger
                        aria-labelledby={perPageId}
                        className="w-20"
                        data-test="rows-per-page"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LIST_PER_PAGE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={String(option)}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {pagination.last_page > 1 ? (
                <TablePagination
                    links={pagination.links ?? []}
                    className="mx-0 w-auto"
                />
            ) : null}
        </div>
    );
}
