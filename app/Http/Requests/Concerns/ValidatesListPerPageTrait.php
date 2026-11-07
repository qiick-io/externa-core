<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Http\Request;

/**
 * Shared "Rows per page" for admin list controllers (`per_page` query param).
 *
 * Only the antd page sizes are accepted; anything else (missing, non-numeric,
 * out of the set) silently falls back to the default so hand-edited or stale
 * URLs keep working instead of failing with 422.
 */
trait ValidatesListPerPageTrait
{
    /** @var list<int> Page sizes offered by the admin "Rows per page" select. */
    public const LIST_PER_PAGE_OPTIONS = [10, 20, 50, 100];

    public const LIST_DEFAULT_PER_PAGE = 20;

    /**
     * Resolve `per_page` to one of {@see self::LIST_PER_PAGE_OPTIONS}.
     *
     * @return int One of 10, 20, 50, 100 (default 20)
     */
    protected function validatedListPerPage(Request $request, string $key = 'per_page'): int
    {
        $requested = $request->query($key);

        if (is_string($requested) && ctype_digit($requested) && in_array((int) $requested, self::LIST_PER_PAGE_OPTIONS, true)) {
            return (int) $requested;
        }

        return self::LIST_DEFAULT_PER_PAGE;
    }
}
