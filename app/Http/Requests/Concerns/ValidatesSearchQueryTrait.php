<?php

namespace App\Http\Requests\Concerns;

use App\Services\Validation\SearchQueryRulesService;
use App\Services\Validation\StringLimitsService;
use Illuminate\Http\Request;

/**
 * Validate and normalize list `search` query params.
 */
trait ValidatesSearchQueryTrait
{
    /**
     * @return non-empty-string|''
     */
    protected function validatedSearch(
        Request $request,
        string $key = 'search',
        int $max = StringLimitsService::SEARCH,
    ): string {
        $validated = $request->validate(SearchQueryRulesService::rules($key, $max));

        return isset($validated[$key])
            ? trim((string) $validated[$key])
            : '';
    }
}
