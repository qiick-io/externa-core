<?php

namespace App\Http\Requests\Concerns;

use App\Support\Validation\SearchQueryRules;
use App\Support\Validation\StringLimits;
use Illuminate\Http\Request;

/**
 * Validate and normalize list `search` query params.
 */
trait ValidatesSearchQuery
{
    /**
     * @return non-empty-string|''
     */
    protected function validatedSearch(
        Request $request,
        string $key = 'search',
        int $max = StringLimits::SEARCH,
    ): string {
        $validated = $request->validate(SearchQueryRules::rules($key, $max));

        return isset($validated[$key])
            ? trim((string) $validated[$key])
            : '';
    }
}
