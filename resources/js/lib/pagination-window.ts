/**
 * The page numbers a list footer shows (#150). Laravel's paginator links hold about ten
 * consecutive pages near either end; with five-digit page numbers that row no longer fits the
 * footer. The footer builds its own compact window instead: the first and last page, the current
 * one with a neighbour on each side, and a gap marker wherever pages are skipped. Near an end the
 * window keeps the same length (`1 2 3 4 5 … 120`), so the row does not jump while paging.
 *
 * No imports: Node runs this file's test with its types stripped.
 */

/** A page number, or `null` where pages are skipped (rendered as an ellipsis). */
export type PaginationWindowEntry = number | null;

/**
 * Pages to show for `currentPage` of `lastPage`: at most seven numbers, gaps as `null`. A gap
 * stands for at least two pages; up to seven pages show them all.
 *
 * @param currentPage - The page on screen (1-based); clamped into `1..lastPage`.
 * @param lastPage - The number of pages; below 1 there is nothing to show.
 */
export function paginationWindow(
    currentPage: number,
    lastPage: number,
): PaginationWindowEntry[] {
    if (lastPage < 1) {
        return [];
    }

    const current = Math.min(Math.max(currentPage, 1), lastPage);
    const shownPages = new Set<number>([
        1,
        lastPage,
        current - 1,
        current,
        current + 1,
    ]);

    if (current <= 3) {
        [2, 3, 4, 5].forEach((page) => shownPages.add(page));
    }

    if (current >= lastPage - 2) {
        [lastPage - 4, lastPage - 3, lastPage - 2, lastPage - 1].forEach(
            (page) => shownPages.add(page),
        );
    }

    const sortedPages = [...shownPages]
        .filter((page) => page >= 1 && page <= lastPage)
        .sort((first, second) => first - second);

    // A gap of one page would hide a single number behind an ellipsis: show the page instead.
    return sortedPages.flatMap((page, position) => {
        const gap = position > 0 ? page - sortedPages[position - 1] : 1;

        if (gap === 2) {
            return [page - 1, page];
        }

        return gap > 2 ? [null, page] : [page];
    });
}

/**
 * The URL of `page`, built from any page link Laravel sent (`templateUrl` for page
 * `templatePage`): the query parameter that carries the template's page number is set to `page`,
 * every other parameter is kept. Laravel names it `page` unless the paginator was given another
 * name, so the parameter is found by its value rather than assumed.
 *
 * @param templateUrl - An absolute or root-relative page URL from the paginator links.
 * @param templatePage - The page that URL points at.
 * @param page - The page to link to.
 */
export function paginationPageUrl(
    templateUrl: string,
    templatePage: number,
    page: number,
): string {
    const isRelative = !/^[a-z][a-z\d+.-]*:/i.test(templateUrl);
    const url = new URL(templateUrl, 'http://relative.invalid');
    const pageParameter =
        [...url.searchParams.entries()].find(
            ([, value]) => value === String(templatePage),
        )?.[0] ?? 'page';

    url.searchParams.set(pageParameter, String(page));

    return isRelative
        ? `${url.pathname}${url.search}${url.hash}`
        : url.toString();
}
