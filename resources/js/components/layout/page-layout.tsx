import { router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
} from '@/components/ui/pagination';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useScrollRegion } from '@/hooks/use-scroll-region';
import { LIST_PER_PAGE_OPTIONS, listUrlWithPerPage } from '@/lib/pagination';
import { paginationPageUrl, paginationWindow } from '@/lib/pagination-window';
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
 * Flat wrapper for data tables with optional sticky footer: no card surface,
 * the table sits straight on the framed content panel (like the file grid),
 * so lists don't read as a box inside a box. Spacing and row separators come
 * from Table*.
 * The panel is the scroll container: the Table wrapper's own overflow is
 * released so the header row sticks to the top of the panel while rows scroll
 * (the bottom rule is an inset shadow because collapsed borders scroll away).
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
    const { t } = useTranslation();
    const scrollRegionRef = useScrollRegion<HTMLDivElement>(
        t('a11y.scrollableTable'),
    );

    return (
        <div
            className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                className,
            )}
        >
            <div
                ref={scrollRegionRef}
                data-slot="table-panel-scroll"
                className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_[data-slot=table-container]]:overflow-visible [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background [&_thead_th]:shadow-[inset_0_-1px_0_var(--color-border)] [&_thead_tr]:border-b-0"
            >
                {children}
            </div>
            {footer ? (
                <div className="flex shrink-0 justify-center border-t px-2 pt-3">
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
 * Pagination row for server-paginated lists on shadcn `Pagination` + `Button`,
 * with Inertia visits: Previous, a compact window of page numbers and Next.
 * Previous / Next keep Laravel's URLs; the page numbers are built from
 * `currentPage` / `lastPage` with {@link paginationWindow} instead of
 * Laravel's own window, which overflows the footer once page numbers reach
 * five digits (app-ui #150). Below `sm` the numbers give way to "Page 3 of
 * 120". Numbers follow the UI language's format. Controls stay `<button>` for
 * browser tests; labels and accessible names are translated.
 *
 * @param props.links - Pagination links from the server (`links` of a Laravel paginator).
 * @param props.currentPage - The page on screen; read from the active link when omitted.
 * @param props.lastPage - The number of pages; read from the highest page link when omitted.
 * @returns {JSX.Element | null}
 */
export function TablePagination({
    links,
    currentPage,
    lastPage,
    className,
}: {
    links: TablePaginationLink[];
    currentPage?: number;
    lastPage?: number;
    className?: string;
}) {
    const { t, i18n } = useTranslation();

    if (links.length === 0) {
        return null;
    }

    const numberFormat = new Intl.NumberFormat(i18n.language);
    const formatNumber = (value: number): string => numberFormat.format(value);
    const pageLinks = links.flatMap((link) => {
        const plain = paginationPlainLabel(link.label);

        return /^\d+$/.test(plain) ? [{ ...link, page: Number(plain) }] : [];
    });
    const current =
        currentPage ?? pageLinks.find((link) => link.active)?.page ?? 1;
    const last =
        lastPage ?? Math.max(current, ...pageLinks.map((link) => link.page));
    const template = pageLinks.find((link) => link.url !== null);
    const pageUrl = (page: number): string | null =>
        template?.url
            ? paginationPageUrl(template.url, template.page, page)
            : null;
    const firstLink = links[0];
    const lastLink = links[links.length - 1];
    const previousUrl = /^\d+$/.test(paginationPlainLabel(firstLink.label))
        ? null
        : firstLink.url;
    const nextUrl = /^\d+$/.test(paginationPlainLabel(lastLink.label))
        ? null
        : lastLink.url;

    return (
        <Pagination className={className}>
            <PaginationContent>
                <PaginationItem>
                    <Button
                        type="button"
                        variant="ghost"
                        className="gap-1 px-2.5"
                        disabled={!previousUrl}
                        aria-label={t('pagination.goToPreviousPage')}
                        onClick={() => previousUrl && router.visit(previousUrl)}
                    >
                        <ChevronLeft />
                        <span className="hidden sm:block">
                            {t('pagination.previous')}
                        </span>
                    </Button>
                </PaginationItem>
                {paginationWindow(current, last).map((page, position) =>
                    page === null ? (
                        <PaginationItem
                            key={`gap-${position}`}
                            className="hidden sm:list-item"
                        >
                            <PaginationEllipsis className="size-auto w-6" />
                        </PaginationItem>
                    ) : (
                        <PaginationItem
                            key={page}
                            className="hidden sm:list-item"
                        >
                            <Button
                                type="button"
                                variant={page === current ? 'outline' : 'ghost'}
                                // Square at one or two digits, wider with longer numbers (app-ui #150).
                                className="min-w-control px-2 tabular-nums"
                                disabled={page !== current && !pageUrl(page)}
                                aria-label={t('pagination.goToPage', {
                                    page: formatNumber(page),
                                })}
                                aria-current={
                                    page === current ? 'page' : undefined
                                }
                                onClick={() => {
                                    const url = pageUrl(page);

                                    if (page !== current && url) {
                                        router.visit(url);
                                    }
                                }}
                            >
                                {formatNumber(page)}
                            </Button>
                        </PaginationItem>
                    ),
                )}
                <PaginationItem className="sm:hidden">
                    <span
                        className="px-2 text-sm whitespace-nowrap text-muted-foreground tabular-nums"
                        aria-live="polite"
                    >
                        {t('common.pageOf', {
                            page: formatNumber(current),
                            total: formatNumber(last),
                        })}
                    </span>
                </PaginationItem>
                <PaginationItem>
                    <Button
                        type="button"
                        variant="ghost"
                        className="gap-1 px-2.5"
                        disabled={!nextUrl}
                        aria-label={t('pagination.goToNextPage')}
                        onClick={() => nextUrl && router.visit(nextUrl)}
                    >
                        <span className="hidden sm:block">
                            {t('pagination.next')}
                        </span>
                        <ChevronRight />
                    </Button>
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
}

/** Paginator slice the list footer needs (flat `Paginated` shape). */
export type TablePaginationState = {
    current_page: number;
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
 * Admin list footer in three areas: the row range ("1–20 of 312") on the
 * left, the page links centred, and the shared rows-per-page select ("20 /
 * page"; 10 / 20 / 50 / 100, URL `per_page`, resets to page 1 and keeps every
 * other query param) on the right. Default-size (32px) shadcn Select per the control scale.
 *
 * @param props.pagination - Current paginator state
 * @returns {JSX.Element}
 */
export function TablePaginationFooter({
    pagination,
}: {
    pagination: TablePaginationState;
}) {
    const { t, i18n } = useTranslation();
    const numberFormat = new Intl.NumberFormat(i18n.language);
    const formatNumber = (value: number): string => numberFormat.format(value);
    const firstRow = Math.min(
        (pagination.current_page - 1) * pagination.per_page + 1,
        pagination.total,
    );
    const lastRow = Math.min(
        pagination.current_page * pagination.per_page,
        pagination.total,
    );

    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <p
                className="text-sm whitespace-nowrap text-muted-foreground tabular-nums"
                data-test="pagination-range"
            >
                {t('common.pageRange', {
                    from: formatNumber(firstRow),
                    to: formatNumber(lastRow),
                    total: formatNumber(pagination.total),
                })}
            </p>
            {pagination.last_page > 1 ? (
                <TablePagination
                    links={pagination.links ?? []}
                    currentPage={pagination.current_page}
                    lastPage={pagination.last_page}
                    className="mx-0 w-auto sm:col-start-2"
                />
            ) : null}
            <div className="sm:col-start-3 sm:justify-self-end">
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
                        aria-label={t('common.rowsPerPage')}
                        className="w-auto"
                        data-test="rows-per-page"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LIST_PER_PAGE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={String(option)}>
                                {t('common.perPageOption', {
                                    count: option,
                                })}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
